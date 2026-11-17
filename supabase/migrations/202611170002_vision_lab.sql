BEGIN;

CREATE TABLE public.vision_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL CHECK (length(user_id) > 0),
    video_bucket text NOT NULL DEFAULT 'vision-videos' CHECK (video_bucket = 'vision-videos'),
    video_path text NOT NULL UNIQUE,
    video_size_bytes bigint NOT NULL CHECK (video_size_bytes BETWEEN 1 AND 209715200),
    video_sha256 text NOT NULL CHECK (video_sha256 ~ '^[0-9a-f]{64}$'),
    video_deleted_at timestamptz,
    events_deleted_at timestamptz,
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    progress real NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms BETWEEN 1 AND 600000),
    width integer CHECK (width IS NULL OR width BETWEEN 1 AND 7680),
    height integer CHECK (height IS NULL OR height BETWEEN 1 AND 4320),
    source_fps real CHECK (source_fps IS NULL OR source_fps > 0),
    decoded_frames integer CHECK (decoded_frames IS NULL OR decoded_frames >= 0),
    sampled_frames integer CHECK (sampled_frames IS NULL OR sampled_frames >= 0),
    actual_sample_fps real CHECK (actual_sample_fps IS NULL OR actual_sample_fps >= 0),
    elapsed_ms bigint CHECK (elapsed_ms IS NULL OR elapsed_ms >= 0),
    average_inference_ms real CHECK (average_inference_ms IS NULL OR average_inference_ms >= 0),
    peak_rss_mb real CHECK (peak_rss_mb IS NULL OR peak_rss_mb >= 0),
    frame_count integer NOT NULL DEFAULT 0 CHECK (frame_count >= 0),
    error_message text CHECK (error_message IS NULL OR char_length(error_message) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz
);

CREATE INDEX vision_jobs_owner_created_idx ON public.vision_jobs(user_id, created_at DESC);
CREATE INDEX vision_jobs_queue_idx ON public.vision_jobs(created_at, id) WHERE status = 'queued';
CREATE INDEX vision_jobs_processing_idx ON public.vision_jobs(updated_at) WHERE status = 'processing';

CREATE TABLE public.vision_detections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cursor bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    job_id uuid NOT NULL REFERENCES public.vision_jobs(id) ON DELETE CASCADE,
    timestamp_ms bigint NOT NULL CHECK (timestamp_ms >= 0),
    model_name text NOT NULL CHECK (length(model_name) BETWEEN 1 AND 200),
    class_id integer NOT NULL CHECK (class_id >= 0),
    class_name text NOT NULL CHECK (length(class_name) BETWEEN 1 AND 80),
    label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
    confidence real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    bbox jsonb NOT NULL CHECK (
        jsonb_typeof(bbox) = 'object'
        AND bbox ?& ARRAY['x1', 'y1', 'x2', 'y2']
        AND (bbox->>'x1')::real >= 0 AND (bbox->>'y1')::real >= 0
        AND (bbox->>'x2')::real >= (bbox->>'x1')::real
        AND (bbox->>'y2')::real >= (bbox->>'y1')::real
    ),
    track_id bigint,
    inference_ms real NOT NULL CHECK (inference_ms >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vision_detections_job_cursor_idx ON public.vision_detections(job_id, cursor);
CREATE INDEX vision_detections_job_timestamp_idx ON public.vision_detections(job_id, timestamp_ms, id);

CREATE TABLE public.vision_model_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name text NOT NULL,
    version text NOT NULL,
    weights_hash text NOT NULL CHECK (weights_hash ~ '^[0-9a-f]{64}$'),
    configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
    licence text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'MODEL_NOT_CONFIGURED'
        CHECK (status IN ('ready', 'MODEL_NOT_CONFIGURED', 'failed')),
    detail text,
    last_checked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (model_name, version, weights_hash)
);

ALTER TABLE public.vision_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_model_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.vision_jobs, public.vision_detections, public.vision_model_versions
    FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.vision_detections_cursor_seq FROM anon, authenticated;

CREATE POLICY vision_jobs_owner_read ON public.vision_jobs
    FOR SELECT TO authenticated USING (user_id = (auth.jwt()->>'sub'));
CREATE POLICY vision_detections_owner_read ON public.vision_detections
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.vision_jobs j
            WHERE j.id = vision_detections.job_id
              AND j.user_id = (auth.jwt()->>'sub')
        )
    );
CREATE POLICY vision_models_enabled_read ON public.vision_model_versions
    FOR SELECT TO authenticated USING (enabled);

-- API functions are service-role-only. The FastAPI layer verifies the Supabase
-- access token, derives p_user_id from its validated `sub`, and never accepts
-- an owner identity from the request body. Each read/update also applies that
-- subject in SQL so a handler cannot accidentally omit its ownership filter.
CREATE OR REPLACE FUNCTION public.edas_vision_create_job(
    p_id uuid, p_user_id text, p_video_path text, p_video_size_bytes bigint,
    p_video_sha256 text, p_duration_ms bigint, p_width integer, p_height integer,
    p_source_fps real
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE job public.vision_jobs%rowtype;
BEGIN
    IF p_user_id IS NULL OR length(p_user_id)=0
       OR p_video_size_bytes NOT BETWEEN 1 AND 209715200
       OR p_video_sha256 !~ '^[0-9a-f]{64}$'
       OR p_duration_ms NOT BETWEEN 1 AND 600000
       OR p_width NOT BETWEEN 1 AND 7680 OR p_height NOT BETWEEN 1 AND 4320
       OR p_source_fps IS NULL OR p_source_fps <= 0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_vision_job';
    END IF;
    INSERT INTO public.vision_jobs
        (id,user_id,video_bucket,video_path,video_size_bytes,video_sha256,
         status,progress,duration_ms,width,height,source_fps)
    VALUES
        (p_id,p_user_id,'vision-videos',p_video_path,p_video_size_bytes,p_video_sha256,
         'queued',0,p_duration_ms,p_width,p_height,p_source_fps)
    RETURNING * INTO job;
    RETURN to_jsonb(job);
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_get_job(p_id uuid, p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE job public.vision_jobs%rowtype;
BEGIN
    SELECT * INTO job FROM public.vision_jobs WHERE id=p_id AND user_id=p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='vision_job_not_found'; END IF;
    RETURN to_jsonb(job);
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_get_events(
    p_id uuid, p_user_id text, p_after bigint, p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE events jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.vision_jobs WHERE id=p_id AND user_id=p_user_id) THEN
        RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='vision_job_not_found';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.cursor),'[]'::jsonb) INTO events
      FROM (
        SELECT id AS event_id,cursor,timestamp_ms,model_name AS model,class_id,class_name,
               label,confidence,bbox,track_id,inference_ms,created_at
          FROM public.vision_detections
         WHERE job_id=p_id AND cursor>greatest(p_after,0)
         ORDER BY cursor LIMIT least(greatest(p_limit,1),1000)
      ) e;
    RETURN events;
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_cancel_job(p_id uuid, p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE job public.vision_jobs%rowtype;
BEGIN
    UPDATE public.vision_jobs SET status='cancelled',updated_at=now(),finished_at=now(),error_message=NULL
     WHERE id=p_id AND user_id=p_user_id AND status IN ('queued','processing')
     RETURNING * INTO job;
    IF NOT FOUND THEN
        SELECT * INTO job FROM public.vision_jobs WHERE id=p_id AND user_id=p_user_id;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='vision_job_not_found'; END IF;
    END IF;
    RETURN jsonb_build_object('job_id',job.id,'status',job.status);
END;
$$;

-- The worker queue claim is one atomic row-lock operation. Multiple workers can
-- safely poll without Redis; SKIP LOCKED prevents duplicate job processing.
CREATE OR REPLACE FUNCTION public.edas_vision_claim_job()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE job public.vision_jobs%rowtype;
BEGIN
    SELECT * INTO job FROM public.vision_jobs
     WHERE status='queued' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    UPDATE public.vision_jobs SET status='processing',progress=0,started_at=now(),updated_at=now(),error_message=NULL
     WHERE id=job.id RETURNING * INTO job;
    RETURN to_jsonb(job);
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_is_cancelled(p_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
    SELECT coalesce((SELECT status <> 'processing' FROM public.vision_jobs WHERE id=p_id),true)
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_save_detection(
    p_job_id uuid,p_event_id uuid,p_timestamp_ms bigint,p_model_name text,
    p_class_id integer,p_class_name text,p_label text,p_confidence real,
    p_bbox jsonb,p_track_id bigint,p_inference_ms real
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE event public.vision_detections%rowtype;
BEGIN
    PERFORM 1 FROM public.vision_jobs WHERE id=p_job_id AND status='processing' FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    INSERT INTO public.vision_detections
        (id,job_id,timestamp_ms,model_name,class_id,class_name,label,confidence,bbox,track_id,inference_ms)
    VALUES
        (p_event_id,p_job_id,p_timestamp_ms,p_model_name,p_class_id,p_class_name,p_label,
         p_confidence,p_bbox,p_track_id,p_inference_ms)
    RETURNING * INTO event;
    RETURN jsonb_build_object('event_id',event.id,'cursor',event.cursor);
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_update_progress(
    p_id uuid,p_progress real,p_frame_count integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    UPDATE public.vision_jobs
       SET progress=least(99,greatest(0,p_progress)),
           frame_count=greatest(frame_count,greatest(0,p_frame_count)),updated_at=now()
     WHERE id=p_id AND status='processing';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_complete_job(
    p_id uuid,p_duration_ms bigint,p_width integer,p_height integer,p_source_fps real,
    p_decoded_frames integer,p_sampled_frames integer,p_actual_sample_fps real,
    p_elapsed_ms bigint,p_average_inference_ms real,p_peak_rss_mb real
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    UPDATE public.vision_jobs SET status='completed',progress=100,duration_ms=p_duration_ms,
        width=p_width,height=p_height,source_fps=p_source_fps,decoded_frames=p_decoded_frames,
        sampled_frames=p_sampled_frames,actual_sample_fps=p_actual_sample_fps,elapsed_ms=p_elapsed_ms,
        average_inference_ms=p_average_inference_ms,peak_rss_mb=p_peak_rss_mb,
        frame_count=p_decoded_frames,updated_at=now(),finished_at=now(),error_message=NULL
     WHERE id=p_id AND status='processing';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_mark_failed(p_id uuid,p_error_message text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    UPDATE public.vision_jobs SET status='failed',updated_at=now(),finished_at=now(),
        error_message=left(coalesce(p_error_message,'Video analysis failed.'),1000)
     WHERE id=p_id AND status='processing';
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.edas_vision_mark_stale_jobs()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE n integer;
BEGIN
    UPDATE public.vision_jobs SET status='failed',updated_at=now(),finished_at=now(),
        error_message='Worker restarted during video processing.'
     WHERE status='processing' AND updated_at < now() - interval '20 minutes';
    GET DIAGNOSTICS n=ROW_COUNT;
    RETURN n;
END;
$$;

-- Only the server-side API and worker use the Supabase service-role token.
-- Never grant these RPCs to browser roles.
REVOKE ALL ON FUNCTION public.edas_vision_create_job(uuid,text,text,bigint,text,bigint,integer,integer,real) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_get_job(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_get_events(uuid,text,bigint,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_cancel_job(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_claim_job() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_is_cancelled(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_save_detection(uuid,uuid,bigint,text,integer,text,text,real,jsonb,bigint,real) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_update_progress(uuid,real,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_complete_job(uuid,bigint,integer,integer,real,integer,integer,real,bigint,real,real) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_mark_failed(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_vision_mark_stale_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edas_vision_create_job(uuid,text,text,bigint,text,bigint,integer,integer,real) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_get_job(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_get_events(uuid,text,bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_cancel_job(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_claim_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_is_cancelled(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_save_detection(uuid,uuid,bigint,text,integer,text,text,real,jsonb,bigint,real) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_update_progress(uuid,real,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_complete_job(uuid,bigint,integer,integer,real,integer,integer,real,bigint,real,real) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_mark_failed(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_vision_mark_stale_jobs() TO service_role;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.vision_jobs,public.vision_detections,public.vision_model_versions TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.vision_detections_cursor_seq TO service_role;

COMMIT;
