// 간단 배구 시뮬 main.js
// 붙여넣기 전 동일 폴더에 index.html과 함께 둘 것

(() => {
  const { Engine, Render, World, Bodies, Body, Events, Vector } = Matter;

  // 캔버스 사이즈: 화면에 맞춤
  const canvas = document.getElementById('game');
  function fitCanvas() {
    canvas.width = Math.min(window.innerWidth, 1000);
    canvas.height = Math.min(window.innerHeight, 800);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  const engine = Engine.create();
  engine.gravity.y = 1; // 중력
  const render = Render.create({
    canvas,
    engine,
    options: {
      wireframes: false,
      background: '#0b1220',
      width: canvas.width,
      height: canvas.height,
      showVelocity: false,
    }
  });

  const W = canvas.width, H = canvas.height;
  // 경기장 비례
  const court = {
    left: 40, right: W - 40,
    top: 80, bottom: H - 80,
    netY: H/2 - 0, // center horizontal net
  };

  // 정적 벽(바닥/벽)
  const walls = [
    Bodies.rectangle(W/2, H + 30, W, 60, { isStatic: true, render:{fillStyle:'#071126'} }),
    Bodies.rectangle(W/2, -30, W, 60, { isStatic: true, render:{fillStyle:'#071126'} }),
    Bodies.rectangle(-30, H/2, 60, H, { isStatic: true, render:{fillStyle:'#071126'} }),
    Bodies.rectangle(W+30, H/2, 60, H, { isStatic: true, render:{fillStyle:'#071126'} })
  ];
  World.add(engine.world, walls);

  // 네트 (시각) — 실제 충돌은 간단히 처리
  const net = Bodies.rectangle(W/2, court.netY, W-120, 8, { isStatic:true, isSensor:true, render:{fillStyle:'#ffffff'} });
  World.add(engine.world, net);

  // 공
  const ball = Bodies.circle(W/2, court.top + 50, 12, {
    restitution: 0.8,
    frictionAir: 0.005,
    density: 0.001,
    render:{fillStyle:'#ffec5c'}
  });
  World.add(engine.world, ball);

  // 플레이어 체계: 6 per side -> 배열로 관리. 단순 원형 바디로 대체
  const players = [];
  const teamA = [], teamB = [];
  const playerRadius = 18;

  // 포지션 배치: 6인제(앞면 3, 뒷면 3)
  function spawnTeams() {
    const spacingX = (court.right - court.left) / 4;
    const middle = W/2;
    // 좌팀(A)
    for (let i=0;i<6;i++){
      const col = i % 3; // 0,1,2 -> 앞/중/뒤 배치 변형 아님 단순
      const row = Math.floor(i/3); // 0,1 -> 앞/뒤
      const x = court.left + spacingX * (col+1) - 10;
      const y = row === 0 ? court.top + 120 : court.bottom - 120;
      const p = Bodies.circle(x, y, playerRadius, { inertia: Infinity, frictionAir: 0.1, render:{fillStyle:'#6ec1ff'} });
      p.label = `A${i}`;
      p.team = 'A';
      p.index = i;
      World.add(engine.world, p);
      players.push(p);
      teamA.push(p);
    }
    // 우팀(B)
    for (let i=0;i<6;i++){
      const col = i % 3;
      const row = Math.floor(i/3);
      const x = court.right - spacingX * (col+1) + 10;
      const y = row === 0 ? court.top + 120 : court.bottom - 120;
      const p = Bodies.circle(x, y, playerRadius, { inertia: Infinity, frictionAir: 0.1, render:{fillStyle:'#ff9b9b'} });
      p.label = `B${i}`;
      p.team = 'B';
      p.index = i;
      World.add(engine.world, p);
      players.push(p);
      teamB.push(p);
    }
  }
  spawnTeams();

  // 간단한 AI 상태 및 경험치(로컬 저장)
  class SimpleAI {
    constructor(player){
      this.p = player;
      // 행동 성향: 숫자 -> 더 높으면 적극적으로 위치 잡고 점프
      const saved = JSON.parse(localStorage.getItem('vv_ai_'+player.label) || 'null');
      this.aggressiveness = saved ? saved.aggressiveness : 0.5 + Math.random()*0.4; // 0..1
      this.successCount = saved ? saved.successCount : 0;
      this.trials = saved ? saved.trials : 0;
      this.state = 'idle';
      this.target = null;
    }
    save(){
      localStorage.setItem('vv_ai_'+this.p.label, JSON.stringify({
        aggressiveness: this.aggressiveness,
        successCount: this.successCount,
        trials: this.trials
      }));
    }
    // 매 프레임 결정
    step(){
      // ball 위치 예측: 단순히 현재 위치를 쫓음
      const bpos = ball.position;
      // 공격 가능 구역이면 앞으로 가고 점프 시도
      const wantX = (this.p.team==='A') ? Math.min(W/2 - 40, bpos.x - (this.p.index%3-1)*20) : Math.max(W/2 + 40, bpos.x - (this.p.index%3-1)*20);
      this.target = { x: wantX, y: this.p.position.y };

      // 이동
      const dir = Vector.sub(this.target, this.p.position);
      const moveForce = Vector.mult(Vector.normalise(dir), 0.002 + 0.001 * this.aggressiveness);
      Body.applyForce(this.p, this.p.position, moveForce);

      // 점프/스파이크 로직: 공이 가까우면 위로 힘 줌
      const dist = Vector.magnitude(Vector.sub(ball.position, this.p.position));
      if (dist < 70 && ( (this.p.team==='A' && ball.position.y > court.top && ball.position.y < court.bottom) || (this.p.team==='B')) ) {
        // 랜덤성으로 성공률 조절
        if (Math.random() < 0.02 + 0.05 * this.aggressiveness) {
          Body.applyForce(this.p, this.p.position, { x:0, y:-0.06 - 0.02*this.aggressiveness });
          // 공에 영향주기: 근처에선 공에 힘
          const forceDir = Vector.normalise(Vector.sub(ball.position, this.p.position));
          Body.applyForce(ball, ball.position, Vector.mult(forceDir, 0.03 + 0.02*this.aggressiveness));
        }
      }
    }
  }

  const aiMap = new Map();
  players.forEach(p => {
    aiMap.set(p.label, new SimpleAI(p));
  });

  // 경기 상태
  let scoreA = 0, scoreB = 0;
  let servingTeam = 'A';
  let rally = 0;

  // 터치/서브: 사용자 터치로 서브 지정 (간단)
  let touchStart = null;
  function startServe(x,y){
    // 공을 서브 위치로 재배치
    if (servingTeam === 'A') {
      Body.setPosition(ball, { x: court.left + 60, y: court.bottom - 160 });
      Body.setVelocity(ball, { x:0, y:0 });
      // 서브 방향: 맞추면 힘 넣음
      const vx = (x - ball.position.x) * 0.02;
      const vy = (y - ball.position.y) * 0.02 - 6;
      Body.applyForce(ball, ball.position, { x: vx*0.002, y: vy*0.002 });
    } else {
      Body.setPosition(ball, { x: court.right - 60, y: court.bottom - 160 });
      Body.setVelocity(ball, { x:0, y:0 });
      const vx = (x - ball.position.x) * 0.02;
      const vy = (y - ball.position.y) * 0.02 - 6;
      Body.applyForce(ball, ball.position, { x: vx*0.002, y: vy*0.002 });
    }
  }

  // 입력 처리 (터치/마우스)
  function getPointer(e){
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = getPointer(e);
    startServe(p.x, p.y);
  });
  canvas.addEventListener('touchstart', (e)=> {
    const p = getPointer(e);
    startServe(p.x, p.y);
    e.preventDefault();
  }, {passive:false});

  // 충돌 이벤트: 공이 바닥에 닿으면 어느 쪽 실책인지 판정
  Events.on(engine, 'collisionStart', (ev) => {
    ev.pairs.forEach(pair => {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (labels.includes('Circle Body') || labels.includes(ball.label)) {
        // ignore generic
      }
    });
  });

  // 바닥에 닿았을 때 점수 처리
  // 아주 단순하게: 공의 y가 바닥 아래쪽이면 어느쪽 영역인지 보고 득점.
  Events.on(engine, 'afterUpdate', () => {
    // AI step
    players.forEach(p => {
      const ai = aiMap.get(p.label);
      if (ai) ai.step();
    });

    // 경계 체크: 공이 바닥에 거의 멈췄을 때 판정
    if (ball.position.y > court.bottom - 20 && Math.abs(ball.velocity.y) < 1) {
      // 어느 쪽에 떨어졌는지
      if (ball.position.x < W/2) {
        // 좌측에 떨어짐 -> B 점수
        scoreB++;
        servingTeam = 'B';
      } else {
        scoreA++;
        servingTeam = 'A';
      }
      rally = 0;
      updateScoreUI();
      resetRally();
    }
    // 공이 좌우 밖으로 나가면 상대 득점
    if (ball.position.x < 0 || ball.position.x > W) {
      if (ball.position.x < 0) scoreB++; else scoreA++;
      rally = 0;
      servingTeam = (ball.position.x < 0) ? 'B' : 'A';
      updateScoreUI();
      resetRally();
    }
  });

  function updateScoreUI(){
    document.getElementById('score').innerText = `${scoreA} - ${scoreB}`;
  }

  function resetRally(){
    // 공 중앙 리셋, 플레이어 위치 초기화
    Body.setPosition(ball, { x: W/2, y: court.top + 40 });
    Body.setVelocity(ball, { x:0, y:0 });
    // 플레이어 원위치
    players.forEach(p => {
      const sideOffset = p.team==='A' ? -1 : 1;
      const baseX = W/2 + sideOffset * 180;
      const row = Math.floor(p.index/3); // 0 앞 1 뒤
      const col = p.index % 3;
      const x = baseX + (col -1) * 50;
      const y = row === 0 ? court.top + 120 : court.bottom - 120;
      Body.setPosition(p, { x,y });
      Body.setVelocity(p, { x:0, y:0 });
    });
    // AI 저장(간단)
    aiMap.forEach(ai => ai.save());
  }

  // 렌더에 커스텀 Draw: 네트 라인, 코트 외곽
  const ctx = render.context;
  Events.on(render, 'afterRender', () => {
    // 코트 사각형
    ctx.beginPath();
    ctx.rect(court.left, court.top, court.right - court.left, court.bottom - court.top);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 네트
    ctx.beginPath();
    ctx.moveTo(W/2, court.top);
    ctx.lineTo(W/2, court.bottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.stroke();

    // 라인 그리기: 중앙
    ctx.font = "14px Arial";
    ctx.fillStyle = '#fff';
    ctx.fillText(`Serving: ${servingTeam}`, 12, 28);
  });

  // UI 버튼
  document.getElementById('resetBtn').addEventListener('click', () => {
    scoreA = 0; scoreB = 0; updateScoreUI(); resetRally();
  });
  let difficulty = 'normal';
  document.getElementById('toggleAI').addEventListener('click', (e) => {
    if (difficulty==='normal') {
      difficulty = 'hard';
      e.target.innerText = 'AI 난이도: 어려움';
      aiMap.forEach(ai => ai.aggressiveness = Math.min(1, ai.aggressiveness + 0.3));
    } else {
      difficulty = 'normal';
      e.target.innerText = 'AI 난이도: 보통';
      aiMap.forEach(ai => ai.aggressiveness = Math.max(0.2, ai.aggressiveness - 0.3));
    }
  });

  // 엔진 시작
  Render.run(render);
  Engine.run(engine);

  // 초기 UI
  updateScoreUI();
  resetRally();

  // 간단 튜닝 메세지
  console.log('간단 배구 시뮬 시작. 터치로 서브. 로컬에 AI 경험 저장됩니다.');
})();
