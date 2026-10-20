const fs=require('node:fs'),path=require('node:path');const root=path.join(__dirname,'..');
fs.rmSync(path.join(root,'dist'),{recursive:true,force:true});
fs.cpSync(path.join(root,'public'),path.join(root,'dist'),{recursive:true});
// Single-file build: no server, no cloud sync. Opens from a USB stick or a static host.
const pub=f=>fs.readFileSync(path.join(root,'public',f),'utf8');
let html=pub('app.html')
 .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g,'')
 .replace('</head>','<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,'+Buffer.from(pub('icon.svg')).toString('base64')+'"></head>')
 .replace(/<button id="account">.*?<\/button>\s*/,'').replace(/<button id="install" hidden>.*?<\/button>\s*/,'')
 .replace('<script src="core.js"></script>','<script>'+pub('core.js').replace(/<\/script/g,'<\\/script')+'</script>')
 .replace('<script src="app.js"></script>','<script>'+pub('app.js').replace(/<\/script/g,'<\\/script')+'</script>')
 .replace('<script src="cloud.js"></script>\n','').replace('<script src="install.js"></script>\n','');
fs.writeFileSync(path.join(root,'dist','focus-single.html'),html);
console.log('Built dist/ (static app) and dist/focus-single.html (one-file version).');
