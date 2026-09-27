// Align the saved ElevenLabs takes, add quiet music, and preserve the video stream.
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root = path.resolve(__dirname, '../..');
const demo = path.join(root, 'demo');
const audio = path.join(demo, 'audio');
const video = path.join(demo, 'ezpm2gui-demo-silent.mp4');
const timing = JSON.parse(fs.readFileSync(path.join(audio, 'timing.json'), 'utf8'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', ...options});
  if (result.status !== 0) throw Error(result.stderr || result.error || `${command} failed`);
  return result.stdout;
}
function duration(file) {
  return Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).trim());
}
function encode(args) {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...args], {stdio: 'inherit', timeout: 60000});
}

const length = duration(video);
if (!Number.isFinite(length) || length <= 0 || length > 180) throw Error('Unexpected demo duration.');
const samples = Math.round(length * 48000);
function verifyDuration(file) {
  if (Math.abs(duration(file) - length) > 0.05) throw Error(`Unexpected audio duration: ${file}`);
}
const clips = timing.starts.map((start, i) => {
  const file = path.join(audio, `elevenlabs-voice-${i}.mp3`);
  const seconds = duration(file);
  const end = timing.starts[i + 1] ?? length;
  if (start + seconds > end - 0.08) throw Error(`Voice section ${i} overlaps the next chapter.`);
  return {file, start, duration: seconds, end: start + seconds};
});
const narration = path.join(audio, 'narration-aligned.wav');
const labels = clips.map((_, i) => `[voice${i}]`).join('');
const voices = clips.map((clip, i) => {
  const delay = Math.round(clip.start * 1000);
  return `[${i}:a]loudnorm=I=-16:TP=-2:LRA=7,aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[voice${i}]`;
});
voices.push(`${labels}amix=inputs=${clips.length}:normalize=0:duration=longest,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB[narration]`);
encode([...clips.flatMap(clip => ['-i', clip.file]), '-filter_complex', voices.join(';'), '-map', '[narration]', '-ar', '48000', '-c:a', 'pcm_s24le', '-t', String(length), '-fs', '64000000', narration]);
verifyDuration(narration);

const mixed = path.join(audio, 'voiceover-with-music.wav');
const music = path.join(audio, 'elevenlabs-music.mp3');
const filters = [
  '[0:a]asplit=2[voice][sidechain]',
  `[1:a]loudnorm=I=-29:TP=-9:LRA=7,aresample=48000,aformat=channel_layouts=stereo,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB,afade=t=in:st=0:d=1.2,afade=t=out:st=${length - 2.5}:d=2.5[music]`,
  '[music][sidechain]sidechaincompress=threshold=0.06:ratio=2:attack=40:release=600[quietmusic]',
  `[voice][quietmusic]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.891:level=0:latency=1,atrim=end_sample=${samples},asetpts=N/SR/TB[mix]`,
];
encode(['-i', narration, '-i', music, '-filter_complex', filters.join(';'), '-map', '[mix]', '-ar', '48000', '-c:a', 'pcm_s24le', '-t', String(length), '-fs', '64000000', mixed]);
verifyDuration(mixed);
encode(['-i', mixed, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(audio, 'voiceover-with-music.mp3')]);
const output = path.join(demo, 'ezpm2gui-demo.mp4');
encode(['-i', video, '-i', mixed, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(length), '-movflags', '+faststart', output]);
fs.writeFileSync(path.join(audio, 'mix-report.json'), JSON.stringify({
  duration: length,
  narrationTargetLufs: -16,
  musicTargetLufs: -29,
  musicDucksDuringSpeech: true,
  clips: clips.map(({file, ...clip}) => ({file: path.basename(file), ...clip})),
}, null, 2) + '\n');
console.log(output);
