(() => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installPrompt;

  const style = document.createElement('style');
  style.textContent = `
    #mf-install-app{position:fixed;right:18px;bottom:18px;z-index:99999;border:1px solid #56a5ff;border-radius:12px;padding:12px 18px;background:#0868dc;color:#fff;font:600 15px system-ui;box-shadow:0 8px 24px #00132c66;cursor:pointer}
    #mf-install-help{position:fixed;inset:0;z-index:100000;background:#001126bb;display:grid;place-items:center;padding:20px;font:16px system-ui;color:#fff}
    #mf-install-help[hidden]{display:none}#mf-install-help article{max-width:440px;padding:24px;border:1px solid #2870b9;border-radius:16px;background:#071a35;box-shadow:0 16px 48px #0008}
    #mf-install-help h2{margin:0 0 12px}#mf-install-help p{line-height:1.5;color:#dceaff}#mf-install-help button{border:1px solid #3978b7;border-radius:9px;padding:10px 16px;background:#102c50;color:white;font-weight:600;cursor:pointer}
  `;
  document.head.append(style);

  const button = document.createElement('button');
  button.id = 'mf-install-app';
  button.type = 'button';
  button.textContent = '⬇ Instalar aplicativo';
  button.setAttribute('aria-label', 'Instalar MF Estoque neste dispositivo');
  document.body.append(button);

  const showHelp = () => {
    const overlay = document.createElement('div');
    overlay.id = 'mf-install-help';
    const instructions = ios
      ? 'No Safari, toque em Compartilhar (□ com seta para cima), role a lista e escolha “Adicionar à Tela de Início”. Depois toque em Adicionar.'
      : 'Abra este endereço no Chrome ou Edge e confirme “Instalar” ou “Adicionar à tela inicial” no menu do navegador.';
    overlay.innerHTML = `<article role="dialog" aria-modal="true" aria-labelledby="mf-install-title"><h2 id="mf-install-title">Instalar MF Estoque</h2><p>${instructions}</p><p>A instalação precisa que o aplicativo esteja publicado em um endereço seguro (HTTPS).</p><button type="button">Entendi</button></article>`;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.tagName === 'BUTTON') overlay.remove();
    });
    document.body.append(overlay);
  };

  button.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      button.hidden = true;
    } else showHelp();
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
  });
  window.addEventListener('appinstalled', () => { button.hidden = true; });
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) button.hidden = true;
})();
