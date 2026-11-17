SET search_path=public,extensions,pg_temp;
CREATE TABLE public.hazards(id uuid primary key default gen_random_uuid(),hazard_type text not null check(hazard_type in('pothole','road_damage','open_manhole','waterlogging','obstruction')),location extensions.geography(Point,4326) not null,severity text not null check(severity in('low','medium','high','critical')),confidence_score real not null default 0 check(confidence_score between 0 and 1),confirmation_count integer not null default 0 check(confirmation_count>=0),status text not null default 'reported' check(status in('reported','verified','assigned','repaired')),description text check(description is null or char_length(description)<=1000),first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),successor_of_hazard_id uuid references public.hazards(id));
CREATE INDEX hazards_location_gix ON public.hazards USING gist(location);
CREATE INDEX hazards_status_idx ON public.hazards(status);
CREATE INDEX hazards_type_idx ON public.hazards(hazard_type);
CREATE INDEX hazards_last_seen_idx ON public.hazards(last_seen_at desc);
CREATE TABLE public.hazard_observations(id uuid primary key default gen_random_uuid(),hazard_id uuid not null references public.hazards(id),reporter_subject text not null,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),hazard_type text not null check(hazard_type in('pothole','road_damage','open_manhole','waterlogging','obstruction')),severity text not null check(severity in('low','medium','high','critical')),source text not null check(source in('manual','ai')),disposition text not null check(disposition in('confirmation','challenge')),description text check(description is null or char_length(description)<=1000),synthetic boolean not null default false,created_at timestamptz not null default now());
CREATE UNIQUE INDEX observations_one_confirmation ON public.hazard_observations(hazard_id,reporter_subject) where disposition='confirmation';
CREATE UNIQUE INDEX observations_one_challenge ON public.hazard_observations(hazard_id,reporter_subject) where disposition='challenge';
CREATE INDEX observations_hazard_created ON public.hazard_observations(hazard_id,created_at);
CREATE TABLE public.hazard_challenges(id uuid primary key default gen_random_uuid(),repaired_hazard_id uuid not null references public.hazards(id),observation_id uuid not null unique references public.hazard_observations(id),challenger_subject text not null,status text not null default 'pending' check(status in('pending','accepted','rejected')),submitted_at timestamptz not null default now(),resolved_at timestamptz,resolver_subject text,resolution_note text check(resolution_note is null or char_length(resolution_note)<=1000),successor_hazard_id uuid references public.hazards(id),unique(repaired_hazard_id,challenger_subject),check((status='pending' and resolved_at is null and successor_hazard_id is null and resolver_subject is null) or(status='accepted' and resolved_at is not null and successor_hazard_id is not null and resolver_subject is not null) or(status='rejected' and resolved_at is not null and successor_hazard_id is null and resolver_subject is not null)));
CREATE INDEX challenges_status_submitted ON public.hazard_challenges(status,submitted_at desc);
CREATE TABLE public.evidence_objects(id uuid primary key default gen_random_uuid(),uploader_subject text not null,bucket text not null default 'road-evidence' check(bucket='road-evidence'),object_path text not null unique,content_type text not null check(content_type in('image/jpeg','image/png','image/webp')),size_bytes bigint not null check(size_bytes between 1 and 10485760),checksum_sha256 text,created_at timestamptz not null default now(),expires_at timestamptz not null,attached_at timestamptz,lifecycle_state text not null default 'pending' check(lifecycle_state in('pending','attached','deleted')),observation_id uuid unique references public.hazard_observations(id),check((lifecycle_state='pending' and attached_at is null and observation_id is null) or(lifecycle_state='attached' and attached_at is not null and observation_id is not null) or lifecycle_state='deleted'));
CREATE INDEX evidence_pending_expiry ON public.evidence_objects(expires_at) where lifecycle_state='pending';
CREATE TABLE public.hazard_status_events(id uuid primary key default gen_random_uuid(),hazard_id uuid not null references public.hazards(id),old_status text not null,new_status text not null,admin_subject text not null,reason text check(reason is null or char_length(reason)<=1000),created_at timestamptz not null default now(),check(old_status in('reported','verified','assigned','repaired')),check(new_status in('reported','verified','assigned','repaired')),check(old_status<>new_status));
CREATE INDEX status_events_hazard_created ON public.hazard_status_events(hazard_id,created_at desc);
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hazards,public.hazard_observations,public.hazard_challenges,public.evidence_objects,public.hazard_status_events FROM anon,authenticated;
-- Single transaction writer: global advisory lock, active first, then repaired challenge.
CREATE OR REPLACE FUNCTION public.edas_submit_hazard_report(p_hazard_type text,p_lat double precision,p_lon double precision,p_severity text,p_description text,p_reporter text,p_evidence uuid default null,p_checksum text default null)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE pt extensions.geography; h public.hazards%rowtype; o public.hazard_observations%rowtype; oid uuid; cid uuid; n integer; cf real; eq real:=0; t timestamptz:=clock_timestamp();
BEGIN
 IF p_hazard_type not in('pothole','road_damage','open_manhole','waterlogging','obstruction') or p_severity not in('low','medium','high','critical') or p_lat is null or p_lat not between -90 and 90 or p_lon is null or p_lon not between -180 and 180 or p_reporter is null or length(p_reporter)=0 or(p_description is not null and char_length(p_description)>1000) then raise exception using errcode='22023',message='invalid_report'; end if;
 PERFORM pg_advisory_xact_lock(1162104659,1);
 pt:=extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon,p_lat),4326)::extensions.geography;
 IF p_evidence IS NOT NULL THEN UPDATE public.evidence_objects SET checksum_sha256=p_checksum WHERE id=p_evidence and uploader_subject=p_reporter and lifecycle_state='pending' and expires_at>t and p_checksum is not null; IF NOT FOUND THEN raise exception using errcode='P0001',message='evidence_not_attachable'; end if; eq:=1; END IF;
 SELECT * INTO h FROM public.hazards WHERE hazard_type=p_hazard_type and status<>'repaired' and extensions.ST_DWithin(location,pt,25) ORDER BY extensions.ST_Distance(location,pt),id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  SELECT * INTO o FROM public.hazard_observations WHERE hazard_id=h.id and reporter_subject=p_reporter and disposition='confirmation';
  IF FOUND THEN SELECT count(*) INTO n FROM public.hazard_observations WHERE hazard_id=h.id and disposition='confirmation'; RETURN jsonb_build_object('outcome','duplicate','hazard_id',h.id,'observation_id',o.id,'challenge_id',null,'duplicate',true,'matched_existing_hazard',true,'confirmation_count',h.confirmation_count,'observation_count',n,'confidence_score',h.confidence_score,'status',h.status); END IF;
  INSERT INTO public.hazard_observations(hazard_id,reporter_subject,latitude,longitude,hazard_type,severity,source,disposition,description) VALUES(h.id,p_reporter,p_lat,p_lon,p_hazard_type,p_severity,'manual','confirmation',p_description) RETURNING id INTO oid;
  IF p_evidence IS NOT NULL THEN UPDATE public.evidence_objects SET lifecycle_state='attached',attached_at=t,observation_id=oid WHERE id=p_evidence; END IF;
  SELECT count(*),(0.5*least(count(distinct reporter_subject)::double precision/5,1)+0.3*exp(-extract(epoch from(t-max(created_at)))/3600/72)+0.2*eq)::real INTO n,cf FROM public.hazard_observations WHERE hazard_id=h.id and disposition='confirmation';
  UPDATE public.hazards SET confirmation_count=n,confidence_score=greatest(0,least(1,cf)),last_seen_at=t,updated_at=t,status=case when cf>=0.5 and status='reported' then 'verified' else status end WHERE id=h.id RETURNING * INTO h;
  RETURN jsonb_build_object('outcome','created','hazard_id',h.id,'observation_id',oid,'challenge_id',null,'duplicate',false,'matched_existing_hazard',true,'confirmation_count',h.confirmation_count,'observation_count',n,'confidence_score',h.confidence_score,'status',h.status);
 END IF;
 SELECT * INTO h FROM public.hazards WHERE hazard_type=p_hazard_type and status='repaired' and extensions.ST_DWithin(location,pt,25) ORDER BY extensions.ST_Distance(location,pt),id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  SELECT c.id,o.id INTO cid,oid FROM public.hazard_challenges c JOIN public.hazard_observations o ON o.id=c.observation_id WHERE c.repaired_hazard_id=h.id and c.challenger_subject=p_reporter;
  IF FOUND THEN RETURN jsonb_build_object('outcome','duplicate_challenge','hazard_id',h.id,'observation_id',oid,'challenge_id',cid,'duplicate',true,'matched_existing_hazard',false,'confirmation_count',0,'observation_count',0,'confidence_score',null,'status','repaired'); END IF;
  INSERT INTO public.hazard_observations(hazard_id,reporter_subject,latitude,longitude,hazard_type,severity,source,disposition,description) VALUES(h.id,p_reporter,p_lat,p_lon,p_hazard_type,p_severity,'manual','challenge',p_description) RETURNING id INTO oid;
  IF p_evidence IS NOT NULL THEN UPDATE public.evidence_objects SET lifecycle_state='attached',attached_at=t,observation_id=oid WHERE id=p_evidence; END IF;
  INSERT INTO public.hazard_challenges(repaired_hazard_id,observation_id,challenger_subject) VALUES(h.id,oid,p_reporter) RETURNING id INTO cid;
  RETURN jsonb_build_object('outcome','challenge_submitted','hazard_id',h.id,'observation_id',oid,'challenge_id',cid,'duplicate',false,'matched_existing_hazard',false,'confirmation_count',0,'observation_count',0,'confidence_score',null,'status','repaired');
 END IF;
 INSERT INTO public.hazards(hazard_type,location,severity,description,first_seen_at,last_seen_at,created_at,updated_at) VALUES(p_hazard_type,pt,p_severity,p_description,t,t,t,t) RETURNING * INTO h;
 INSERT INTO public.hazard_observations(hazard_id,reporter_subject,latitude,longitude,hazard_type,severity,source,disposition,description) VALUES(h.id,p_reporter,p_lat,p_lon,p_hazard_type,p_severity,'manual','confirmation',p_description) RETURNING id INTO oid;
 IF p_evidence IS NOT NULL THEN UPDATE public.evidence_objects SET lifecycle_state='attached',attached_at=t,observation_id=oid WHERE id=p_evidence; END IF;
 cf:=0.4+0.2*eq;
 UPDATE public.hazards SET confirmation_count=1,confidence_score=cf,status=case when cf>=0.5 then 'verified' else 'reported' end WHERE id=h.id RETURNING * INTO h;
 RETURN jsonb_build_object('outcome','created','hazard_id',h.id,'observation_id',oid,'challenge_id',null,'duplicate',false,'matched_existing_hazard',false,'confirmation_count',1,'observation_count',1,'confidence_score',h.confidence_score,'status',h.status);
END $$;
CREATE OR REPLACE FUNCTION public.edas_update_hazard_status(p_id uuid,p_new text,p_admin text,p_reason text default null)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE h public.hazards%rowtype; old text; ev uuid;
BEGIN
 IF p_new not in('reported','verified','assigned','repaired') or p_admin is null or length(p_admin)=0 or(p_reason is not null and char_length(p_reason)>1000) then raise exception using errcode='22023',message='invalid_status_update'; end if;
 SELECT * INTO h FROM public.hazards WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN raise exception using errcode='P0002',message='hazard_not_found'; END IF;
 IF h.status=p_new THEN RETURN jsonb_build_object('id',h.id,'status',h.status,'updated_at',h.updated_at,'status_event_id',null); END IF;
 old:=h.status; IF NOT((old='reported' and p_new='verified') or(old='verified' and p_new='assigned') or(old='assigned' and p_new='repaired')) then raise exception using errcode='40001',message='disallowed_status_transition'; END IF;
 UPDATE public.hazards SET status=p_new,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO h;
 INSERT INTO public.hazard_status_events(hazard_id,old_status,new_status,admin_subject,reason) VALUES(p_id,old,p_new,p_admin,p_reason) RETURNING id INTO ev;
 RETURN jsonb_build_object('id',h.id,'status',h.status,'updated_at',h.updated_at,'status_event_id',ev);
END $$;
CREATE OR REPLACE FUNCTION public.edas_resolve_hazard_challenge(p_id uuid,p_new text,p_admin text,p_note text default null)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE c public.hazard_challenges%rowtype; o public.hazard_observations%rowtype; h public.hazards%rowtype; s public.hazards%rowtype; t timestamptz:=clock_timestamp(); eq real; cf real;
BEGIN
 IF p_new not in('accepted','rejected') or p_admin is null or length(p_admin)=0 or(p_note is not null and char_length(p_note)>1000) then raise exception using errcode='22023',message='invalid_challenge_resolution'; end if;
 SELECT * INTO c FROM public.hazard_challenges WHERE id=p_id FOR UPDATE; IF NOT FOUND THEN raise exception using errcode='P0002',message='challenge_not_found'; END IF;
 IF c.status<>'pending' THEN raise exception using errcode='40001',message='challenge_already_resolved'; END IF;
 SELECT * INTO h FROM public.hazards WHERE id=c.repaired_hazard_id FOR UPDATE; SELECT * INTO o FROM public.hazard_observations WHERE id=c.observation_id FOR UPDATE;
 IF p_new='accepted' THEN
  INSERT INTO public.hazards(hazard_type,location,severity,confidence_score,confirmation_count,status,description,first_seen_at,last_seen_at,created_at,updated_at,successor_of_hazard_id)
  VALUES(o.hazard_type,extensions.ST_SetSRID(extensions.ST_MakePoint(o.longitude,o.latitude),4326)::extensions.geography,o.severity,0.5,1,'reported',o.description,t,t,t,t,h.id) RETURNING * INTO s;
  UPDATE public.hazard_observations SET hazard_id=s.id,disposition='confirmation' WHERE id=o.id;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM public.evidence_objects WHERE observation_id=o.id AND lifecycle_state='attached') THEN 1 ELSE 0 END INTO eq;
  cf:=0.4+0.2*eq;
  UPDATE public.hazards SET confidence_score=cf,status=CASE WHEN cf>=0.5 THEN 'verified' ELSE 'reported' END WHERE id=s.id;
 END IF;
 UPDATE public.hazard_challenges SET status=p_new,resolved_at=t,resolver_subject=p_admin,resolution_note=p_note,successor_hazard_id=case when p_new='accepted' then s.id else null end WHERE id=p_id RETURNING * INTO c;
 RETURN jsonb_build_object('challenge_id',c.id,'status',c.status,'resolved_at',c.resolved_at,'successor_hazard_id',c.successor_hazard_id);
END $$;
REVOKE ALL ON FUNCTION public.edas_submit_hazard_report(text,double precision,double precision,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_update_hazard_status(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edas_resolve_hazard_challenge(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edas_submit_hazard_report(text,double precision,double precision,text,text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_update_hazard_status(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edas_resolve_hazard_challenge(uuid,text,text,text) TO service_role;
