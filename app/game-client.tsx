"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Clone, Sky, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

type Vec3 = [number, number, number];
type PeerState = { id: string; name: string; position: Vec3; rotation: number; score: number; weapon: number; moving: boolean; sprinting: boolean };

const WEAPONS = [
  { name: "ZIPPER", model: "/models/blaster-a.glb", clip: 18, damage: 34, cooldown: 150, color: "#78f7ff", quip: "Small. Loud. Unreasonably confident." },
  { name: "THUMPER", model: "/models/blaster-f.glb", clip: 8, damage: 60, cooldown: 420, color: "#ffca3a", quip: "One chunky hello." },
  { name: "DRAMA QUEEN", model: "/models/blaster-p.glb", clip: 4, damage: 100, cooldown: 760, color: "#ff4fd8", quip: "Misses quietly. Hits theatrically." },
];

const NAMES = ["TurboMoth", "SnackAttack", "WaffleWizard", "LaserLlama", "PixelPirate", "BouncyBean"];

const COLLIDERS = [
  { x:-15, z:-18, w:1, d:38 }, { x:15, z:-18, w:1, d:38 },
  { x:0, z:1, w:30, d:1 }, { x:0, z:-37, w:30, d:1 },
  { x:-7, z:-11, w:5, d:5 }, { x:8, z:-13, w:4, d:7 },
  { x:0, z:-23, w:8, d:4 }, { x:-9, z:-29, w:4, d:5 }, { x:10, z:-29, w:5, d:4 },
];

function ModeledArena() {
  const room=useGLTF("/models/arena/room-large-variation.glb");
  const corridor=useGLTF("/models/arena/corridor-wide.glb");
  const stairs=useGLTF("/models/arena/stairs-wide.glb");
  return <>
    <color attach="background" args={["#090715"]}/><Sky sunPosition={[80,35,50]} turbidity={7}/>
    <ambientLight intensity={1.1}/><directionalLight position={[8,18,5]} intensity={2.5} castShadow/>
    <pointLight position={[-9,5,-18]} color="#ff4fd8" intensity={45} distance={25}/><pointLight position={[9,5,-22]} color="#5df2ff" intensity={45} distance={25}/>
    <group position={[0,0,-18]} scale={2.5}><Clone object={room.scene} castShadow receiveShadow/></group>
    <group position={[0,0,-31]} scale={2.1} rotation={[0,Math.PI/2,0]}><Clone object={corridor.scene} castShadow receiveShadow/></group>
    <group position={[-9,0,-27]} scale={1.7} rotation={[0,Math.PI/2,0]}><Clone object={stairs.scene} castShadow receiveShadow/></group>
    <mesh position={[0,-.6,-18]} receiveShadow><boxGeometry args={[30,1,38]}/><meshStandardMaterial color="#17182d" roughness={.8}/></mesh>
    {COLLIDERS.slice(4).map((c,i)=><group key={i} position={[c.x,0,c.z]}><Clone object={i%2?corridor.scene:stairs.scene} scale={.55} castShadow receiveShadow/></group>)}
  </>;
}

function FoxPlayer({ state }: { state: PeerState }) {
  const gltf = useGLTF("/models/fox.glb");
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(gltf.animations, group);
  useEffect(() => {
    const action = actions[state.sprinting ? "Run" : state.moving ? "Walk" : "Survey"];
    Object.values(actions).forEach(a => a?.fadeOut(.15));
    action?.reset().fadeIn(.15).play();
  }, [actions, state.moving, state.sprinting]);
  return <group ref={group} position={state.position} rotation={[0,state.rotation,0]} scale={.018}>
    <Clone object={gltf.scene} castShadow />
    <group position={[0,120,0]} scale={55}><mesh><boxGeometry args={[2.3,.5,.3]} /><meshBasicMaterial color="#ff365e" /></mesh></group>
  </group>;
}

function WeaponView({ weapon, reloading, sprinting, aiming }: { weapon: number; reloading: boolean; sprinting: boolean; aiming:boolean }) {
  const data = useGLTF(WEAPONS[weapon].model);
  const ref = useRef<THREE.Group>(null);
  const reloadPhase=useRef(0);
  const { camera, clock } = useThree();
  useFrame((_,dt) => {
    if (!ref.current) return;
    reloadPhase.current=reloading?Math.min(1,reloadPhase.current+dt/1.05):0;
    const bob = sprinting ? Math.sin(clock.elapsedTime*12)*.045 : Math.sin(clock.elapsedTime*5)*.012;
    const t=reloadPhase.current; const arc=Math.sin(t*Math.PI);
    const pos = new THREE.Vector3(aiming?.12:.52,(aiming?-.28:-.48)+bob-arc*.42,aiming?-.78:-1.05).applyQuaternion(camera.quaternion).add(camera.position);
    ref.current.position.copy(pos); ref.current.quaternion.copy(camera.quaternion);
    ref.current.rotateZ(-arc*1.25); ref.current.rotateX(arc*.35);
  });
  return <group ref={ref} scale={.7} rotation={[0,Math.PI/2,0]}><Clone object={data.scene} /></group>;
}

function Arena({ name, roomId, onHud, onPeers }: { name: string; roomId: string; onHud:(v:any)=>void; onPeers:(v:PeerState[])=>void }) {
  const { camera, gl } = useThree();
  const perspectiveCamera=camera as THREE.PerspectiveCamera;
  const keys = useRef<Record<string,boolean>>({});
  const velocityY = useRef(0); const grounded = useRef(true); const yaw = useRef(0); const pitch = useRef(0);
  const score = useRef(0); const weapon = useRef(0); const ammo = useRef(WEAPONS[0].clip); const lastShot=useRef(0); const reloading=useRef(false);
  const peers = useRef<Record<string,PeerState>>({}); const room = useRef<{leave:()=>void} | null>(null); const selfIdRef=useRef("you"); const sendState = useRef<((d:any)=>void)|null>(null);

  const reload = useCallback(() => {
    if (reloading.current || ammo.current===WEAPONS[weapon.current].clip) return;
    reloading.current=true; onHud({reloading:true});
    window.setTimeout(()=>{ammo.current=WEAPONS[weapon.current].clip; reloading.current=false; onHud({ammo:ammo.current,reloading:false});},1050);
  },[onHud]);

  const shoot = useCallback(() => {
    if (document.pointerLockElement !== gl.domElement || reloading.current) return;
    const now=performance.now(); const w=WEAPONS[weapon.current]; if(now-lastShot.current<w.cooldown)return;
    if(ammo.current<=0){reload();return;} lastShot.current=now; ammo.current--; onHud({ammo:ammo.current,flash:now});
    const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0,0),camera);
    Object.entries(peers.current).forEach(([id,p])=>{const d=ray.ray.distanceToPoint(new THREE.Vector3(...p.position).add(new THREE.Vector3(0,1,0)));if(d<1.2){sendState.current?.({hit:id,damage:w.damage,by:name});}});
  },[camera,gl.domElement,name,onHud,reload]);

  useEffect(()=>{
    camera.position.set(0,1.7,4);
    const kd=(e:KeyboardEvent)=>{keys.current[e.code]=true;if(e.code==="KeyR")reload();if(e.code==="Space"&&grounded.current){velocityY.current=6.8;grounded.current=false;}};
    const ku=(e:KeyboardEvent)=>{keys.current[e.code]=false};
    const mm=(e:MouseEvent)=>{if(document.pointerLockElement!==gl.domElement)return;yaw.current-=e.movementX*.0022;pitch.current=THREE.MathUtils.clamp(pitch.current-e.movementY*.0018,-1.35,1.25)};
    gl.domElement.addEventListener("mousedown",shoot); window.addEventListener("keydown",kd);window.addEventListener("keyup",ku);window.addEventListener("mousemove",mm);
    return()=>{gl.domElement.removeEventListener("mousedown",shoot);window.removeEventListener("keydown",kd);window.removeEventListener("keyup",ku);window.removeEventListener("mousemove",mm)};
  },[camera,gl.domElement,reload,shoot]);

  useEffect(()=>{
    let cancelled=false;
    void import("trystero").then(({joinRoom,selfId})=>{
      if(cancelled)return;
      selfIdRef.current=selfId;
      const r=joinRoom({appId:"gungame-neon-arena-v1"},roomId); room.current=r;
      const stateAction=r.makeAction<any>("state"); sendState.current=(data)=>{void stateAction.send(data)};
      stateAction.onMessage=(data,{peerId:id})=>{if(data.position){peers.current[id]={...data,id};onPeers(Object.values(peers.current));} if(data.hit&&data.hit===selfIdRef.current){onHud({healthHit:data.damage});}};
      r.onPeerLeave=id=>{delete peers.current[id];onPeers(Object.values(peers.current))};
    });
    return()=>{cancelled=true;sendState.current=null;room.current?.leave();room.current=null};
  },[name,onHud,onPeers,roomId]);

  useFrame((_,dt)=>{
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch.current,yaw.current,0,"YXZ")); camera.quaternion.copy(q);
    const forward=new THREE.Vector3(-Math.sin(yaw.current),0,-Math.cos(yaw.current)); const right=new THREE.Vector3(Math.cos(yaw.current),0,-Math.sin(yaw.current));
    const dir=new THREE.Vector3(); if(keys.current.KeyW)dir.add(forward);if(keys.current.KeyS)dir.sub(forward);if(keys.current.KeyD)dir.add(right);if(keys.current.KeyA)dir.sub(right);
    const sprinting=!!(keys.current.ShiftLeft||keys.current.ShiftRight); if(dir.lengthSq())dir.normalize().multiplyScalar((sprinting?10:6)*dt);
    const next=camera.position.clone().add(dir); const radius=.55; const blocked=COLLIDERS.some(c=>Math.abs(next.x-c.x)<c.w/2+radius&&Math.abs(next.z-c.z)<c.d/2+radius); if(!blocked)camera.position.copy(next);
    velocityY.current-=18*dt;camera.position.y+=velocityY.current*dt;if(camera.position.y<1.7){camera.position.y=1.7;velocityY.current=0;grounded.current=true}
    camera.position.x=THREE.MathUtils.clamp(camera.position.x,-14.2,14.2);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-36,0);
    const aiming=!!keys.current.KeyE; const targetFov=aiming?52:72; perspectiveCamera.fov=THREE.MathUtils.lerp(perspectiveCamera.fov,targetFov,.18);perspectiveCamera.updateProjectionMatrix();
    const state={id:selfIdRef.current,name,position:[camera.position.x,camera.position.y-1.6,camera.position.z] as Vec3,rotation:yaw.current,score:score.current,weapon:weapon.current,moving:dir.lengthSq()>0,sprinting};
    sendState.current?.(state); onHud({sprinting,moving:state.moving,aiming,position:state.position});
  });

  return <>
    <ModeledArena/>
    {Object.values(peers.current).map(p=><FoxPlayer key={p.id} state={p}/>) }
    <WeaponView weapon={weapon.current} reloading={reloading.current} sprinting={!!keys.current.ShiftLeft} aiming={!!keys.current.KeyE}/>
  </>;
}

function Leaderboard({ players, you }: { players: PeerState[]; you: {name:string;score:number} }) {
  const list=[{id:"you",name:you.name,score:you.score,weapon:0,position:[0,0,0] as Vec3,rotation:0,moving:false,sprinting:false},...players].sort((a,b)=>b.score-a.score).slice(0,6);
  return <div className="leaderboard" aria-label="Leaderboard">{list.map((p,i)=><div className={`leader ${p.id==="you"?"is-you":""}`} key={p.id}><b>#{i+1}</b><span>{["🦊","🦝","🐯","🐸","🐼","🐵"][i]}</span><strong>{p.score}</strong>{p.id==="you"&&<em>YOU</em>}</div>)}</div>;
}

export default function GameClient(){
  const [phase,setPhase]=useState<"menu"|"playing">("menu");
  const [name,setName]=useState(()=>NAMES[Math.floor(Math.random()*NAMES.length)]); const [roomCode,setRoomCode]=useState("QUICKPLAY");
  const [peers,setPeers]=useState<PeerState[]>([]); const [hud,setHud]=useState({score:0,weapon:0,ammo:WEAPONS[0].clip,reloading:false,health:100,flash:0,hit:false,sprinting:false});
  const [time,setTime]=useState(300); const stableHud=useCallback((v:any)=>setHud(h=>({...h,...v,healthHit:undefined,health:v.healthHit?Math.max(0,h.health-v.healthHit):h.health})),[]); const stablePeers=useCallback((p:PeerState[])=>setPeers(p),[]);
  useEffect(()=>{if(phase!=="playing")return;const id=setInterval(()=>setTime(t=>Math.max(0,t-1)),1000);return()=>clearInterval(id)},[phase]);
  const start=(code?:string)=>{setRoomCode((code||"QUICKPLAY").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,10)||"QUICKPLAY");setPhase("playing")};
  if(phase==="menu")return <main className="menu-screen">
    <div className="noise"/><section className="hero"><div className="eyebrow">PEER-TO-PEER · NO BOTS · PURE CHAOS</div><h1>GUN<span>GAME</span></h1><p>Every three tags, your blaster changes personality. First fox to 15 wins.</p>
      <div className="player-row"><label>CALLSIGN<input value={name} maxLength={16} onChange={e=>setName(e.target.value)}/></label><button className="play" onClick={()=>start()}>QUICK PLAY <small>find a lobby</small></button></div>
      <div className="private-row"><input aria-label="Private room code" value={roomCode} onChange={e=>setRoomCode(e.target.value)} placeholder="ROOM CODE"/><button onClick={()=>start(roomCode)}>JOIN PRIVATE</button></div>
    </section>
    <section className="arena-card"><span>THE ARENA</span><strong>ORBITAL BREAKER</strong><p>A complete modeled space station with solid walls, cover, corridors and stairs. No targets. No bots. Only players.</p><div><b>ONE ARENA</b><b>FULL COLLISION</b><b>P2P PLAYERS</b></div></section>
    <footer><span>WASD move</span><span>SHIFT sprint</span><span>SPACE jump</span><span>R reload</span><span>HOLD E aim</span><span>CLICK blast</span><a href="https://kenney.nl/assets/modular-space-kit" target="_blank">CC0 arena by Kenney ↗</a></footer>
  </main>;
  const w=WEAPONS[hud.weapon];
  return <main className="game-screen" onClick={e=>{const c=e.currentTarget.querySelector("canvas");c?.requestPointerLock()}}>
    <Canvas shadows camera={{fov:72,near:.1,far:140}}><Suspense fallback={null}><Arena name={name} roomId={roomCode} onHud={stableHud} onPeers={stablePeers}/></Suspense></Canvas>
    <div className={`hit-flash ${hud.hit?"show":""}`}/><div className="crosshair"><i/><i/></div>
    <div className="topbar"><div className="brand">GUN<span>GAME</span></div><div className="room"><b>{peers.length?`${peers.length+1} PLAYERS`:"PRIVATE LOBBY"}</b><small>{peers.length?"LIVE P2P MATCH":"share code to invite"} · {roomCode}</small></div><div className="timer">{String(Math.floor(time/60)).padStart(2,"0")}:{String(time%60).padStart(2,"0")}</div></div>
    <Leaderboard players={peers} you={{name,score:hud.score}}/>
    <div className="killfeed">{peers.length===0?"Private lobby — share the code for players":"A challenger entered the arena"}</div>
    <div className="weapon-card" style={{"--gun":w.color} as any}><small>NEXT TAG WEAPON</small><b>{w.name}</b><span>“{w.quip}”</span></div>
    <div className="health"><i style={{width:`${hud.health}%`}}/><b>{hud.health}</b><span>HP</span></div>
    <div className="ammo"><span>{hud.reloading?"RELOADING…":w.name}</span><b>{hud.ammo}</b><small>/ {w.clip}</small></div>
    <button className="escape" onClick={e=>{e.stopPropagation();document.exitPointerLock();setPhase("menu")}}>ESC · MENU</button>
    <div className="click-to-play">CLICK TO LOCK AIM · WASD TO MOVE</div>
  </main>;
}

useGLTF.preload("/models/fox.glb"); useGLTF.preload("/models/arena/room-large-variation.glb"); useGLTF.preload("/models/arena/corridor-wide.glb"); useGLTF.preload("/models/arena/stairs-wide.glb"); WEAPONS.forEach(w=>useGLTF.preload(w.model));
