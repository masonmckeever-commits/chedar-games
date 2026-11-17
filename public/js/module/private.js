function openBlankTab(url) {
    const win = window.open('about:blank', '_blank');

    if (!win) return;

    win.document.open();

    win.document.write(
        `<!DOCTYPE html><html><head><title>Schoology</title>` +
        `<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000;}` +
        `iframe{width:100vw;height:100vh;border:0;display:block;}` +
        `#panic-btn{position:fixed;left:8px;bottom:8px;z-index:99999;width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;opacity:.35;background:#e0e0e0;color:#333;font-size:18px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.4);}` +
        `#panic-btn:hover{opacity:.8;}</style><link rel="icon" href="https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico" type="image/png" /></head>` +
        `<body><iframe src="${url}" allow="autoplay; fullscreen; clipboard-write; encrypted-media" allowfullscreen></iframe>` +
        `<button id="panic-btn" title="Panic">&#9888;</button>` +
        `<script>document.getElementById('panic-btn').addEventListener('click',function(){document.open();document.write('<!DOCTYPE html><html><head><title>Blank</title></head><body style="margin:0;background:#fff"></body></html>');document.close();});</script></body></html>`
    );

    win.document.close();
}

export { openBlankTab };