/* GHOUSTORY: DESA TERLARANG — lightweight 3D prototype.
 * Babylon.js is loaded only when this Arena mode is opened.
 * Initial scope: local exploration, third-person camera, mobile joystick,
 * jump/sprint/interact, procedural low-poly village and clue discovery.
 * Multiplayer, authored assets and contextual voice are later milestones.
 */
(() => {
  'use strict';

  const MODE = 'berkas';
  const BABYLON_URL = 'https://cdn.babylonjs.com/babylon.js';
  let activeGame = null;
  let loadingPromise = null;
  const originalPlayArena = window.playArena;
  const originalCloseArenaGame = window.closeArenaGame;

  function loadBabylon() {
    if (window.BABYLON) return Promise.resolve(window.BABYLON);
    if (loadingPromise) return loadingPromise;
    loadingPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-desaterlarang-babylon]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.BABYLON), { once: true });
        existing.addEventListener('error', () => reject(new Error('Mesin 3D gagal dimuat. Periksa koneksi internet.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = BABYLON_URL;
      script.async = true;
      script.dataset.desaterlarangBabylon = 'true';
      script.onload = () => window.BABYLON
        ? resolve(window.BABYLON)
        : reject(new Error('Babylon.js berhasil dimuat tetapi tidak tersedia.'));
      script.onerror = () => reject(new Error('Mesin 3D gagal dimuat. Periksa koneksi internet.'));
      document.head.appendChild(script);
    });
    return loadingPromise;
  }

  function panelMarkup() {
    return `
      <div class="dt-game-shell">
        <div class="dt-game-topbar">
          <button type="button" class="dt-back" id="dt-back">← Kembali ke Arena</button>
          <div class="dt-heading"><span>GHOUSTORY ORIGINAL • PETUALANGAN 3D</span><strong>DESA TERLARANG</strong></div>
          <div class="dt-objective" id="dt-objective">Temukan 3 petunjuk misterius</div>
        </div>
        <div class="dt-world-wrap">
          <canvas id="dt-world" aria-label="Dunia 3D Desa Terlarang"></canvas>
          <div class="dt-loading" id="dt-loading">Membangunkan desa…</div>
          <div class="dt-hint" id="dt-hint">Jelajahi desa. Dekati benda bercahaya untuk memeriksanya.</div>
          <div class="dt-mobile-controls" id="dt-mobile-controls">
            <div class="dt-stick-zone" id="dt-stick-zone"><div class="dt-stick" id="dt-stick"></div></div>
            <div class="dt-action-stack">
              <button type="button" id="dt-interact" class="dt-action dt-interact">PERIKSA</button>
              <div class="dt-action-row"><button type="button" id="dt-jump" class="dt-action">LOMPAT</button><button type="button" id="dt-sprint" class="dt-action">LARI</button></div>
            </div>
          </div>
          <div class="dt-desktop-help">WASD / tombol panah: bergerak · Shift: lari · Spasi: lompat · E: periksa · Seret layar: putar kamera</div>
        </div>
        <div class="dt-game-status">
          <span id="dt-clue-count">Petunjuk: 0 / 3</span>
          <span id="dt-game-message">Kabut menutupi jalan masuk desa…</span>
        </div>
        <style>
          .dt-game-shell{color:#eee8dd;display:grid;gap:10px;min-width:0}
          .dt-game-topbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
          .dt-back{border:1px solid #374151;background:#111827;border-radius:10px;padding:9px 12px;font-size:11px;color:#e5e7eb}
          .dt-heading{display:grid;gap:2px;min-width:0;flex:1}
          .dt-heading span{font-size:8px;letter-spacing:.18em;color:#fca5a5}
          .dt-heading strong{font-family:Georgia,serif;font-size:17px;letter-spacing:.08em}
          .dt-objective{font-size:10px;color:#bfdbfe;border:1px solid #1e3a5f;border-radius:999px;padding:7px 10px}
          .dt-world-wrap{position:relative;width:100%;height:min(68dvh,620px);min-height:360px;overflow:hidden;border:1px solid #293244;border-radius:16px;background:#080d17;isolation:isolate}
          #dt-world{display:block;width:100%;height:100%;outline:0;touch-action:none}
          .dt-loading{position:absolute;inset:0;display:grid;place-items:center;background:#080d17;color:#e5d5b5;font:13px Georgia,serif;letter-spacing:.1em;z-index:5}
          .dt-loading[hidden]{display:none}
          .dt-hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);max-width:calc(100% - 24px);padding:8px 12px;border:1px solid #64748b66;border-radius:999px;background:#080d17bb;color:#e5e7eb;font-size:10px;text-align:center;pointer-events:none}
          .dt-desktop-help{position:absolute;left:10px;bottom:10px;padding:7px 9px;border-radius:8px;background:#05070bcc;color:#cbd5e1;font-size:9px;pointer-events:none}
          .dt-mobile-controls{display:none;position:absolute;inset:auto 12px 14px;align-items:flex-end;justify-content:space-between;pointer-events:none}
          .dt-stick-zone{width:112px;height:112px;border:1px solid #cbd5e155;border-radius:50%;background:#0f172a88;position:relative;pointer-events:auto;touch-action:none}
          .dt-stick{position:absolute;width:46px;height:46px;left:32px;top:32px;border-radius:50%;background:#cbd5e5bb;border:2px solid #fff8;box-shadow:0 4px 16px #0008}
          .dt-action-stack{display:grid;gap:8px;justify-items:end;pointer-events:auto}
          .dt-action-row{display:flex;gap:8px}
          .dt-action{min-width:62px;min-height:42px;border:1px solid #cbd5e566;border-radius:12px;background:#101827dd;color:#f8fafc;font-size:9px;font-weight:800;padding:8px;touch-action:none}
          .dt-interact{background:#7f1d1ddd;border-color:#fca5a566;min-width:82px}
          .dt-game-status{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:10px;color:#94a3b8}
          #dt-clue-count{color:#fca5a5;font-weight:700}
          @media(max-width:700px){.dt-world-wrap{height:68dvh;min-height:390px}.dt-mobile-controls{display:flex}.dt-desktop-help{display:none}.dt-heading strong{font-size:15px}.dt-objective{font-size:9px}}
          @media(prefers-reduced-motion:reduce){.dt-stick{box-shadow:none}}
        </style>
      </div>`;
  }

  function startWorld() {
    const panel = document.getElementById('arena-play-panel');
    const canvas = document.getElementById('dt-world');
    const loading = document.getElementById('dt-loading');
    const message = document.getElementById('dt-game-message');
    if (!panel || !canvas) return;

    loadBabylon().then(B => {
      if (!document.getElementById('dt-world')) return;
      const isMobile = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
      const engine = new B.Engine(canvas, true, {
        preserveDrawingBuffer: false,
        stencil: false,
        antialias: !isMobile,
        adaptToDeviceRatio: true
      });
      engine.setHardwareScalingLevel(isMobile ? 1.25 : 1);
      const scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0.025, 0.04, 0.075, 1);
      scene.fogMode = B.Scene.FOGMODE_EXP2;
      scene.fogDensity = 0.012;
      scene.fogColor = new B.Color3(0.055, 0.075, 0.12);

      const hemi = new B.HemisphericLight('moonAmbient', new B.Vector3(0, 1, 0), scene);
      hemi.intensity = 0.72;
      const moonLight = new B.DirectionalLight('moonLight', new B.Vector3(-0.4, -1, 0.35), scene);
      moonLight.intensity = 0.42;

      const mat = (name, color, emissive = null) => {
        const m = new B.StandardMaterial(name, scene);
        m.diffuseColor = B.Color3.FromHexString(color);
        if (emissive) m.emissiveColor = B.Color3.FromHexString(emissive);
        return m;
      };
      const groundMat = mat('earth', '#303b35');
      const pathMat = mat('mudPath', '#514638');
      const wallMat = mat('oldWood', '#514238');
      const roofMat = mat('roof', '#252b35');
      const windowMat = mat('darkWindows', '#101827');
      const treeMat = mat('treeBark', '#30251f');
      const leafMat = mat('deadLeaves', '#26352f');
      const clueMat = mat('clueGlow', '#d6a85b', '#8b5a20');
      const playerMat = mat('playerCoat', '#8b1e2d');
      const skinMat = mat('playerSkin', '#c99c7a');

      const ground = B.MeshBuilder.CreateGround('villageGround', { width: 180, height: 180 }, scene);
      ground.material = groundMat;
      const path = B.MeshBuilder.CreateGround('villagePath', { width: 5, height: 70 }, scene);
      path.position.y = 0.015;
      path.position.z = 7;
      path.material = pathMat;

      function box(name, x, y, z, w, h, d, material) {
        const mesh = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
        mesh.position.set(x, y, z);
        mesh.material = material;
        return mesh;
      }
      function hut(x, z, scale = 1) {
        box('abandonedHouse', x, 1.35 * scale, z, 5 * scale, 2.7 * scale, 4 * scale, wallMat);
        const roof = B.MeshBuilder.CreateCylinder('pyramidRoof', {
          diameterTop: 0, diameterBottom: 7.2 * scale, height: 2.3 * scale, tessellation: 4
        }, scene);
        roof.position.set(x, 3.75 * scale, z);
        roof.rotation.y = Math.PI / 4;
        roof.material = roofMat;
        box('door', x, 0.9 * scale, z - 2.02 * scale, 0.85 * scale, 1.8 * scale, 0.08, windowMat);
        box('window', x - 1.45 * scale, 1.65 * scale, z - 2.04 * scale, 0.65 * scale, 0.6 * scale, 0.08, windowMat);
      }
      hut(-9, 8, 1.05); hut(10, 17, 0.9); hut(-12, 29, 0.82); hut(12, 39, 1.1);
      for (let i = 0; i < 34; i++) {
        const side = i % 2 ? 1 : -1;
        const z = -8 + (i * 5.2);
        const x = side * (10 + ((i * 7) % 13));
        const trunk = B.MeshBuilder.CreateCylinder('treeTrunk', { diameter: 0.45, height: 3.8, tessellation: 5 }, scene);
        trunk.position.set(x, 1.9, z);
        trunk.material = treeMat;
        const crown = B.MeshBuilder.CreateSphere('treeCrown', { diameter: 3.8, segments: 5 }, scene);
        crown.position.set(x, 4.2, z);
        crown.scaling.y = 1.2;
        crown.material = leafMat;
      }
      // Distant ridge silhouettes use simple low-poly boxes; no real-time shadows.
      for (let i = 0; i < 8; i++) {
        const ridge = B.MeshBuilder.CreateCylinder('distantRidge', { diameterTop: 0, diameterBottom: 24, height: 12 + (i % 3) * 4, tessellation: 5 }, scene);
        ridge.position.set(-65 + i * 19, 4, 62 + (i % 2) * 9);
        ridge.material = leafMat;
      }

      // Player placeholder: intentionally primitive and inexpensive until authored avatar assets arrive.
      const player = new B.TransformNode('player', scene);
      const body = B.MeshBuilder.CreateCapsule
        ? B.MeshBuilder.CreateCapsule('playerBody', { height: 1.65, radius: 0.38, tessellation: 6 }, scene)
        : B.MeshBuilder.CreateCylinder('playerBody', { height: 1.65, diameter: 0.76, tessellation: 8 }, scene);
      body.parent = player; body.position.y = 1.05; body.material = playerMat;
      const head = B.MeshBuilder.CreateSphere('playerHead', { diameter: 0.62, segments: 6 }, scene);
      head.parent = player; head.position.y = 2.08; head.material = skinMat;

      const clues = [
        { name: 'Surat Lusuh', x: -6, z: 10, detail: 'Surat itu menyebut nama sebuah keluarga yang menghilang pada malam yang sama setiap tahun.' },
        { name: 'Lentera Padam', x: 8, z: 23, detail: 'Sumbu lentera masih hangat. Seolah baru saja ada seseorang yang memadamkannya.' },
        { name: 'Sumur Tua', x: -3, z: 37, detail: 'Dari dasar sumur terdengar tiga ketukan. Tidak ada tali yang bergerak.' }
      ];
      clues.forEach((clue, index) => {
        const stone = B.MeshBuilder.CreateSphere('clue' + index, { diameter: 0.65, segments: 6 }, scene);
        stone.position.set(clue.x, 0.55, clue.z);
        stone.material = clueMat;
        const ring = B.MeshBuilder.CreateTorus('clueRing' + index, { diameter: 1.25, thickness: 0.045, tessellation: 12 }, scene);
        ring.position.set(clue.x, 0.12, clue.z);
        ring.rotation.x = Math.PI / 2;
        ring.material = clueMat;
        clue.mesh = stone;
      });

      const cameraTarget = new B.Vector3(0, 1.4, 0);
      let yaw = 0, pitch = 0.18, verticalVelocity = 0, grounded = true;
      const camera = new B.FreeCamera('thirdPersonCamera', new B.Vector3(0, 4, -7), scene);
      camera.minZ = 0.15;
      camera.fov = 0.82;
      const keys = Object.create(null);
      let joystickX = 0, joystickY = 0, dragging = false, lastX = 0, lastY = 0;
      let sprintHeld = false, jumpQueued = false, clueCount = 0;
      let nearestClue = null, clueRefreshElapsed = 0;
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

      function updateClues() {
        nearestClue = null;
        let bestSquared = 3.2 * 3.2;
        for (const clue of clues) {
          if (clue.found) continue;
          const dx = player.position.x - clue.x;
          const dz = player.position.z - clue.z;
          const distanceSquared = dx * dx + dz * dz;
          if (distanceSquared < bestSquared) { bestSquared = distanceSquared; nearestClue = clue; }
        }
        const interact = document.getElementById('dt-interact');
        const hint = document.getElementById('dt-hint');
        if (interact) interact.textContent = nearestClue ? 'PERIKSA' : 'PERIKSA';
        if (hint) hint.textContent = nearestClue ? 'Tekan E / PERIKSA untuk menemukan petunjuk' : 'Jelajahi desa dan dekati cahaya keemasan';
      }
      function interact() {
        if (!nearestClue) {
          if (message) message.textContent = 'Belum ada petunjuk di dekatmu. Terus jelajahi desa.';
          return;
        }
        nearestClue.found = true;
        nearestClue.mesh.setEnabled(false);
        clueCount++;
        const count = document.getElementById('dt-clue-count');
        const objective = document.getElementById('dt-objective');
        if (count) count.textContent = 'Petunjuk: ' + clueCount + ' / 3';
        if (objective) objective.textContent = clueCount === 3 ? 'Semua petunjuk ditemukan' : 'Temukan ' + (3 - clueCount) + ' petunjuk lagi';
        if (message) message.textContent = nearestClue.name + ': ' + nearestClue.detail;
        updateClues();
        if (clueCount === 3 && message) message.textContent = 'Tiga petunjuk terkumpul. Jalan menuju bagian terdalam desa mulai terbuka…';
      }

      function setJump() { if (grounded) { verticalVelocity = 6.2; grounded = false; } }
      function bindHold(id, onDown, onUp) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); onDown(); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => el.addEventListener(type, onUp));
      }
      bindHold('dt-jump', setJump, () => {});
      bindHold('dt-sprint', () => { sprintHeld = true; }, () => { sprintHeld = false; });
      document.getElementById('dt-interact')?.addEventListener('click', interact);

      const stickZone = document.getElementById('dt-stick-zone');
      const stick = document.getElementById('dt-stick');
      let stickPointer = null;
      if (stickZone && stick) {
        stickZone.addEventListener('pointerdown', e => {
          e.preventDefault(); stickPointer = e.pointerId; stickZone.setPointerCapture(e.pointerId); moveStick(e);
        });
        stickZone.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) moveStick(e); });
        const release = e => {
          if (e.pointerId !== stickPointer) return;
          stickPointer = null; joystickX = 0; joystickY = 0; stick.style.transform = 'translate(0,0)';
        };
        stickZone.addEventListener('pointerup', release);
        stickZone.addEventListener('pointercancel', release);
      }
      function moveStick(e) {
        const rect = stickZone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const length = Math.max(1, Math.hypot(dx, dy)), radius = 34, scale = Math.min(1, radius / length);
        joystickX = dx / radius * scale;
        joystickY = -dy / radius * scale;
        stick.style.transform = 'translate(' + (dx * scale) + 'px,' + (dy * scale) + 'px)';
      }

      canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); });
      canvas.addEventListener('pointermove', e => {
        if (!dragging) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        yaw -= dx * 0.006;
        pitch = clamp(pitch + dy * 0.003, -0.05, 0.62);
      });
      const stopDrag = () => { dragging = false; };
      canvas.addEventListener('pointerup', stopDrag);
      canvas.addEventListener('pointercancel', stopDrag);
      const onKeyDown = e => {
        keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        if (e.code === 'KeyE' && !e.repeat) interact();
        if (e.code === 'Space' && !e.repeat) setJump();
      };
      const onKeyUp = e => { keys[e.code] = false; };
      const onBlur = () => { sprintHeld = false; Object.keys(keys).forEach(k => keys[k] = false); };
      window.addEventListener('keydown', onKeyDown, { passive: false });
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);

      function update() {
        const dt = Math.min(engine.getDeltaTime() / 1000, 0.04);
        const forwardInput = clamp(joystickY + (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), -1, 1);
        const sideInput = clamp(joystickX + (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), -1, 1);
        const inputLength = Math.hypot(forwardInput, sideInput);
        let dx = 0, dz = 0;
        if (inputLength > 0.08) {
          const f = forwardInput / Math.max(1, inputLength), s = sideInput / Math.max(1, inputLength);
          dx = Math.sin(yaw) * f + Math.cos(yaw) * s;
          dz = Math.cos(yaw) * f - Math.sin(yaw) * s;
          const speed = sprintHeld || keys.ShiftLeft || keys.ShiftRight ? 6.0 : 3.5;
          player.position.x += dx * speed * dt;
          player.position.z += dz * speed * dt;
          player.rotation.y = Math.atan2(dx, dz);
        }
        if (!grounded) {
          verticalVelocity -= 15 * dt;
          player.position.y += verticalVelocity * dt;
          if (player.position.y <= 0) { player.position.y = 0; verticalVelocity = 0; grounded = true; }
        }
        player.position.x = clamp(player.position.x, -35, 35);
        player.position.z = clamp(player.position.z, -12, 55);
        cameraTarget.set(player.position.x, player.position.y + 1.3, player.position.z);
        const distance = 7.2, height = 2.2 + pitch * 3;
        const cameraPos = new B.Vector3(
          player.position.x + Math.sin(yaw) * distance,
          player.position.y + height,
          player.position.z - Math.cos(yaw) * distance
        );
        camera.position = B.Vector3.Lerp(camera.position, cameraPos, 1 - Math.pow(0.001, dt));
        camera.setTarget(cameraTarget);
        clueRefreshElapsed += dt;
        if (clueRefreshElapsed >= 0.12) {
          clueRefreshElapsed = 0;
          updateClues();
        }
      }

      scene.onBeforeRenderObservable.add(update);
      let disposed = false;
      const resize = () => { if (!disposed) engine.resize(); };
      window.addEventListener('resize', resize);
      const qualityTimer = window.setInterval(() => {
        if (disposed || !engine.getFps) return;
        const fps = engine.getFps();
        if (fps < 27 && engine.getHardwareScalingLevel() < 1.5) engine.setHardwareScalingLevel(1.5);
        else if (fps > 52 && engine.getHardwareScalingLevel() > (isMobile ? 1.25 : 1)) engine.setHardwareScalingLevel(isMobile ? 1.25 : 1);
      }, 2500);
      engine.runRenderLoop(() => { if (!disposed) scene.render(); });
      if (loading) loading.hidden = true;
      updateClues();

      activeGame = {
        dispose() {
          if (disposed) return;
          disposed = true;
          clearInterval(qualityTimer);
          window.removeEventListener('resize', resize);
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onKeyUp);
          window.removeEventListener('blur', onBlur);
          engine.stopRenderLoop();
          scene.dispose();
          engine.dispose();
          activeGame = null;
        }
      };
    }).catch(error => {
      if (loading) loading.textContent = error.message || 'Game 3D belum dapat dimuat.';
      if (message) message.textContent = 'Periksa koneksi internet, lalu buka kembali Desa Terlarang.';
      console.error('[Desa Terlarang]', error);
    });
  }

  window.playArena = function(mode) {
    if (mode !== MODE) return originalPlayArena?.(mode);
    originalPlayArena?.(MODE);
    const panel = document.getElementById('arena-play-panel');
    if (!panel) return;
    activeGame?.dispose();
    panel.innerHTML = panelMarkup();
    document.getElementById('dt-back')?.addEventListener('click', () => window.closeArenaGame?.());
    startWorld();
  };

  window.closeArenaGame = function() {
    activeGame?.dispose();
    activeGame = null;
    return originalCloseArenaGame?.();
  };
})();