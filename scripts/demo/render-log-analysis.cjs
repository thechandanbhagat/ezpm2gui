#!/usr/bin/env node
'use strict';

// Render the isolated UI walkthrough and mix the saved Lucy take without stretching it.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const demo = path.join(root, 'demo/log-analysis');
const audio = path.join(demo, 'audio');
const input = path.join(demo, 'raw/walkthrough.webm');
const silent = path.join(demo, 'ezpm2gui-log-analysis-demo-silent.mp4');
const output = path.join(demo, 'ezpm2gui-log-analysis-demo.mp4');
const narration = path.join(audio, 'lucy-voiceover.mp3');
const music = path.join(root, 'demo/audio/elevenlabs-music.mp3');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const silentOnly = process.argv.includes('--silent-only');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 180000, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || `${command} exited with ${result.status}`);
  }
  return result;
}

function encode(args) {
  run(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y', ...args], { stdio: 'inherit' });
}

function probe(file) {
  return JSON.parse(run(ffprobe, [
    '-v', 'error', '-show_entries',
    'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels,duration',
    '-of', 'json', file,
  ]).stdout);
}

function duration(file) {
  const seconds = Number(probe(file).format.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid duration: ${file}`);
  return seconds;
}

function loudness(file, target, peak) {
  const result = run(ffmpeg, [
    '-hide_banner', '-nostats', '-i', file, '-vn',
    '-af', `loudnorm=I=${target}:TP=${peak}:LRA=7:print_format=json`, '-f', 'null', '-',
  ]);
  const blocks = result.stderr.match(/\{[\s\S]*?\}/g);
  if (!blocks?.length) throw new Error(`Missing loudness measurements: ${file}`);
  const measured = JSON.parse(blocks.at(-1));
  for (const key of ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']) {
    if (!Number.isFinite(Number(measured[key]))) throw new Error(`Invalid ${key} for ${file}`);
  }
  return measured;
}

function normalization(target, peak, measured) {
  return `loudnorm=I=${target}:TP=${peak}:LRA=7:measured_I=${measured.input_i}` +
    `:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
}

function requireFile(file, action) {
  if (!fs.existsSync(file)) throw new Error(`${action}: ${path.relative(root, file)}`);
}

requireFile(input, 'Record the walkthrough first; missing file');
requireFile(path.join(demo, 'timeline.json'), 'Record the walkthrough first; missing timeline');
if (!silentOnly) {
  requireFile(narration, 'Save the selected Lucy take before rendering; missing file');
  requireFile(music, 'Restore the existing authorized music asset; missing file');
}
const timing = JSON.parse(fs.readFileSync(path.join(demo, 'timeline.json'), 'utf8'));
const lead = Number(timing.leadSeconds);
const length = Number(timing.plannedDuration ?? 63);
const voiceDelay = Number(timing.voiceDelaySeconds ?? 1);
if (!Number.isFinite(lead) || lead < 0 || lead > 30 || !Number.isFinite(length) || length < 10 || length > 180 ||
    !Number.isFinite(voiceDelay) || voiceDelay < 0 || voiceDelay >= length) {
  throw new Error('Unexpected recording or narration timing.');
}
const rawDuration = duration(input);
if (rawDuration < lead + length - 0.25) throw new Error('The raw recording does not cover the planned timeline.');
const voiceDuration = silentOnly ? null : duration(narration);
if (voiceDuration !== null && voiceDelay + voiceDuration > length - 0.25) {
  throw new Error('Narration exceeds the recorded timeline. Extend the recording; do not stretch the voice.');
}

fs.mkdirSync(audio, { recursive: true });
fs.mkdirSync(path.join(demo, 'frames'), { recursive: true });
encode([
  '-ss', String(lead), '-i', input, '-t', String(length), '-an',
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=0.25',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', silent,
]);

let mixStats = null;
let narrationStats = null;
let musicStats = null;
if (!silentOnly) {
  narrationStats = loudness(narration, -16, -2);
  musicStats = loudness(music, -30, -9);
  const samples = Math.round(length * 48000);
  const delayMs = Math.round(voiceDelay * 1000);
  const aligned = path.join(audio, 'narration-aligned.wav');
  encode([
    '-i', narration,
    '-af', normalization(-16, -2, narrationStats) +
      `,aresample=48000,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs},` +
      `apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB`,
    '-ar', '48000', '-c:a', 'pcm_s24le', '-t', String(length), aligned,
  ]);
  const mixed = path.join(audio, 'voiceover-with-music.wav');
  const filters = [
    '[0:a]asplit=2[voice][sidechain]',
    '[1:a]' + normalization(-30, -9, musicStats) +
      `,aresample=48000,aformat=channel_layouts=stereo,atrim=end_sample=${samples},asetpts=N/SR/TB,` +
      `afade=t=in:st=0:d=2,afade=t=out:st=${length - 2}:d=2[music]`,
    '[music][sidechain]sidechaincompress=threshold=0.04:ratio=3:attack=30:release=600[quietmusic]',
    '[voice][quietmusic]amix=inputs=2:normalize=0:duration=first,aresample=192000,' +
      `alimiter=limit=0.891250938:level=0:latency=1,aresample=48000,atrim=end_sample=${samples},asetpts=N/SR/TB[mix]`,
  ];
  encode([
    '-i', aligned, '-stream_loop', '-1', '-i', music, '-filter_complex', filters.join(';'),
    '-map', '[mix]', '-ar', '48000', '-c:a', 'pcm_s24le', '-t', String(length), mixed,
  ]);
  encode([
    '-i', silent, '-i', mixed, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(length), '-movflags', '+faststart', output,
  ]);
  mixStats = loudness(output, -16, -1);
  if (Number(mixStats.input_tp) > -0.95) throw new Error('Encoded audio exceeds the -1 dBTP ceiling; inspect the mix.');
}

const rendered = silentOnly ? silent : output;
const media = probe(rendered);
const video = media.streams.find(stream => stream.codec_type === 'video');
if (video?.width !== 1920 || video?.height !== 1080 || video?.r_frame_rate !== '30/1' ||
    Math.abs(Number(media.format.duration) - length) > 0.1) throw new Error('Unexpected rendered video format or duration.');
if (!silentOnly && !media.streams.some(stream => stream.codec_type === 'audio')) throw new Error('The final video has no audio stream.');

const posterTime = Math.min(2, length - 0.2);
encode(['-ss', String(posterTime), '-i', silent, '-frames:v', '1', '-update', '1', path.join(demo, 'poster.png')]);
encode([
  '-i', silent, '-vf', `fps=9/${length},scale=640:-1,tile=3x3:padding=8:margin=8:color=0x11161c`,
  '-frames:v', '1', '-q:v', '2', '-update', '1', path.join(demo, 'contact-sheet.jpg'),
]);
const verificationTimes = [
  { name: 'intro', seconds: 2 },
  ...(timing.timeline || []).map((scene, index) => ({
    name: `chapter-${String(index + 1).padStart(2, '0')}`, seconds: Number(scene.actualStart ?? scene.start) + 2,
  })),
  { name: 'outro', seconds: length - 3 },
];
for (const frame of verificationTimes) {
  if (!Number.isFinite(frame.seconds)) continue;
  encode([
    '-ss', String(Math.max(0, Math.min(length - 0.1, frame.seconds))), '-i', silent,
    '-frames:v', '1', '-update', '1', path.join(demo, `frames/${frame.name}.png`),
  ]);
}

const report = {
  output: path.relative(root, rendered), silentOutput: path.relative(root, silent),
  durationSeconds: Number(media.format.duration), plannedDurationSeconds: length,
  rawDurationSeconds: rawDuration, trimmedLeadSeconds: lead,
  voiceDelaySeconds: voiceDelay, voiceDurationSeconds: voiceDuration,
  resolution: `${video.width}x${video.height}`, fps: 30, streams: media.streams,
  audio: silentOnly ? null : {
    narrationTargetLufs: -16, musicTargetLufs: -30, limiterCeilingDbTp: -1,
    limiterOversamplingRate: 192000, musicDucksDuringSpeech: true,
    musicFadeSeconds: 2, narrationTimeStretch: false,
    encodedIntegratedLufs: Number(mixStats.input_i), encodedTruePeakDbTp: Number(mixStats.input_tp),
    narrationMeasurements: narrationStats, musicMeasurements: musicStats,
  },
  synthetic: true, simulatedProviders: true, simulatedAnalysis: true,
  browserErrors: timing.browserErrors || [], failedApi: timing.failedApi || [],
  verificationFrames: verificationTimes,
};
fs.writeFileSync(path.join(demo, 'render-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(rendered);
