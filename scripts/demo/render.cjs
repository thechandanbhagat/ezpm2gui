// Encode the captured walkthrough; optionally add a supplied narration track.
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const root=path.resolve(__dirname,'../..');
const input=path.join(root,'demo/raw/walkthrough.webm');
const narration=process.argv[2]&&path.resolve(process.argv[2]);
const output=path.join(root,'demo',narration?'ezpm2gui-demo.mp4':'ezpm2gui-demo-silent.mp4');
function duration(file){
 const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'});
 if(r.status!==0)throw Error(r.stderr||'ffprobe failed');
 return Number(r.stdout.trim());
}
if(!fs.existsSync(input))throw Error('Run record.cjs first.');
const videoDuration=duration(input)-0.3;
if(narration&&duration(narration)>videoDuration)throw Error('Narration is longer than the footage. Adjust the scene timings and record again.');
const args=['-hide_banner','-loglevel','warning','-y','-ss','0.3','-i',input];
if(narration)args.push('-i',narration,'-map','0:v:0','-map','1:a:0','-af','apad','-c:a','aac','-b:a','192k','-shortest');
else args.push('-an');
args.push('-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','medium','-crf','18','-movflags','+faststart',output);
const result=spawnSync('ffmpeg',args,{stdio:'inherit'});
if(result.status!==0)throw Error('ffmpeg failed');
console.log(output);
