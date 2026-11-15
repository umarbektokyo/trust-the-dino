# promo film (≈70 s, 1920x1080, 30 fps)
`node video/promo/capture.mjs` records the real app (needs it on :8290) into clips/; extract frames with `ffmpeg -i clips/v9.webm -vf fps=30 -q:v 3 clips/v9/%04d.jpg` (same for theme.webm → clips/theme/).
`node video/promo/music.mjs` writes music.wav, an original 100 BPM synth score generated in code.
`node video/promo/render.mjs` steps index.html's `render(t)` frame by frame and pipes it to ffmpeg → promo.mp4 (`--at 5,20` renders test stills).
Scenes and their times are in SCENES at the top of the script in index.html; cuts sit on the beat (0.6 s).
