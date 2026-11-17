# EDAS Vision Lab benchmark

The benchmark runs the configured RDD2022 road-damage checkpoint on CPU. It requires a local short MP4, `backend/.venv`, and the verified model file at `backend/vision/models/pothole/road_damage_best.pt`. It does not generate detections or use the API's mock data.

```powershell
.
scripts\qa\vision-benchmark.ps1 -VideoPath C:\path\to\short-road-clip.mp4 -ImagePath C:\path\to\road-image.jpg
```

`-ImagePath` is optional. Supply a real road image or video sample. The script warms the model once, measures a decoder-only pass, then measures the combined sampled-frame inference pass. JSON output includes model/checkpoint versions and hash, class availability, source dimensions and FPS, decoder-only FPS, sampled/combined FPS, processing time per video minute, inference latency percentiles, sampled RSS and CPU/RAM facts when Windows exposes them. Event transport latency is `null` in this local runner; measure it separately against a disposable API/SSE environment.

Example with a different target:

```powershell
scripts\qa\vision-benchmark.ps1 -VideoPath .\sample.mp4 -SampleFps 10 -ImageSize 640 -Confidence 0.10
```

The video path is read-only. The runner does not upload footage or call Supabase. Detection events in the output are only events returned by the configured model; a zero-event result is reported as zero.
