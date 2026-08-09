"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Clone, Sky, useAnimations, useGLTF } from "@react-three/drei";
import { joinRoom, selfId, type Room } from "trystero";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

type MapId = "SKYDOCK" | "JUNGLE JAM" | "NEON VAULT";
type Vec3 = [number, number, number];
type PeerState = { id: string; name: string; position: Vec3; rotation: number; score: number; weapon: number; moving: boolean; sprinting: boolean };

const MAPS: { id: MapId; label: string; sub: string; accent: string }[] = [
  { id: "SKYDOCK", label: "Skydock 99", sub: "launch pads · long lanes", accent: "#ffca3a" },
  { id: "JUNGLE JAM", label: "Jungle Jam", sub: "temple loops · jump routes", accent: "#8cff65" },
  { id: "NEON VAULT", label: "Neon Vault", sub: "tight corners · pure chaos", accent: "#ff4fd8" },
];

const WEAPONS = [
  { name: "ZIPPER", model: "/models/blaster-a.glb", clip: 18, damage: 34, cooldown: 150, color: "#78f7ff", quip: "Small. Loud. Unreasonably confident." },
  { name: "THUMPER", model: "/models/blaster-f.glb", clip: 8, damage: 60, cooldown: 420, color: "#ffca3a", quip: "One chunky hello." },
  { name: "DRAMA QUEEN", model: "/models/blaster-p.glb", clip: 4, damage: 100, cooldown: 760, color: "#ff4fd8", quip: "Misses quietly. Hits theatrically." },
];

const PRACTICE_TARGETS: Vec3[] = [[0,1.3,-12],[-8,1.3,-16],[9,2.8,-20],[-13,1.2,-28],[12,1.2,-30],[0,5,-35]];
const NAMES = ["TurboMoth", "SnackAttack", "WaffleWizard", "LaserLlama", "PixelPirate", "BouncyBean"];

function MapGeometry({ map }: { map: MapId }) {
  const colors = map === "SKYDOCK" ? ["#e8edf6", "#aebbd1", "#ffca3a"] : map === "JUNGLE JAM" ? ["#355b3c", "#203a2c", "#83dc5b"] : ["#18132f", "#34245a", "#ff4fd8"];
  const blocks = useMemo(() => {
    const base: { p: Vec3; s: Vec3 }[] = [];
    for (let z = -8; z > -48; z -= 8) {
      base.push({ p: [-12 + ((-z / 8) % 3) * 5, 1.5, z], s: [4, 3, 4] });
      base.push({ p: [11 - ((-z / 8) % 2) * 6, 2, z - 3], s: [5, 4, 3] });
    }
    return base;
  }, []);
  return <>
    <color attach="background" args={[map === "SKYDOCK" ? "#7cc9ff" : map === "JUNGLE JAM" ? "#17382d" : "#090715"]} />
    {map === "SKYDOCK" && <Sky sunPosition={[100,40,80]} turbidity={4} rayleigh={1.5} />}
    <ambientLight intensity={map === "NEON VAULT" ? 0.45 : 1.15} />
    <directionalLight position={[8,18,5]} intensity={2.1} castShadow />
    <mesh position={[0,-.55,-24]} receiveShadow><boxGeometry args={[34,1,62]} /><meshStandardMaterial color={colors[0]} roughness={.72} /></mesh>
    <mesh position={[-17,5,-24]}><boxGeometry args={[1,11,62]} /><meshStandardMaterial color={colors[1]} /></mesh>
    <mesh position={[17,5,-24]}><boxGeometry args={[1,11,62]} /><meshStandardMaterial color={colors[1]} /></mesh>
    {blocks.map((b,i) => <mesh key={i} position={b.p} castShadow receiveShadow><boxGeometry args={b.s} /><meshStandardMaterial color={i%3===0?colors[2]:colors[1]} roughness={.55} metalness={map==="NEON VAULT"?.45:.08} /></mesh>)}
    {map === "JUNGLE JAM" && Array.from({length:20},(_,i)=><mesh key={`tree${i}`} position={[-15+(i%2)*30,2,-3-i*2.4]}><cylinderGeometry args={[.5,.9,5,7]} /><meshStandardMaterial color="#5c3f2e" /></mesh>)}
    {map === "NEON VAULT" && [-10,0,10].map((x)=><pointLight key={x} position={[x,4,-22]} color={x===0?"#65f7ff":"#ff4fd8"} intensity={35} distance={18}/>)}
    <gridHelper args={[60,30,map==="NEON VAULT"?"#ff4fd8":"#5f7891",map==="NEON VAULT"?"#302451":"#b8c3d0"]} position={[0,.01,-24]} />
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

function PracticeTarget({ position, alive }: { position: Vec3; alive: boolean }) {
  if (!alive) return null;
  return <group position={position}>
    <mesh castShadow><sphereGeometry args={[.65,16,12]} /><meshStandardMaterial color="#ff365e" emissive="#741124" emissiveIntensity={.8} /></mesh>
    <mesh position={[0,-1,0]} castShadow><cylinderGeometry args={[.18,.42,2,8]} /><meshStandardMaterial color="#5d3aff" /></mesh>
    <mesh position={[0,0,.6]}><torusGeometry args={[.3,.08,8,18]} /><meshBasicMaterial color="white" /></mesh>
  </group>;
}

function WeaponView({ weapon, reloadTick, sprinting }: { weapon: number; reloadTick: number; sprinting: boolean }) {
  const data = useGLTF(WEAPONS[weapon].model);
  const ref = useRef<THREE.Group>(null);
  const { camera, clock } = useThree();
  useFrame(() => {
    if (!ref.current) return;
    const bob = sprinting ? Math.sin(clock.elapsedTime*12)*.045 : Math.sin(clock.elapsedTime*5)*.012;
    const pos = new THREE.Vector3(.52,-.48+bob,-1.05).applyQuaternion(camera.quaternion).add(camera.position);
    ref.current.position.copy(pos); ref.current.quaternion.copy(camera.quaternion);
    ref.current.rotation.z += reloadTick ? .035 : 0;
  });
  return <group ref={ref} scale={.7} rotation={[0,Math.PI/2,0]}><Clone object={data.scene} /></group>;
}

function Arena({ map, name, roomId, onHud, onPeers }: { map: MapId; name: string; roomId: string; onHud:(v:any)=>void; onPeers:(v:PeerState[])=>void }) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string,boolean>>({});
  const velocityY = useRef(0); const grounded = useRef(true); const yaw = useRef(0); const pitch = useRef(0);
  const score = useRef(0); const weapon = useRef(0); const ammo = useRef(WEAPONS[0].clip); const lastShot=useRef(0); const reloading=useRef(false);
  const targetAlive = useRef(PRACTICE_TARGETS.map(()=>true));
  const peers = useRef<Record<string,PeerState>>({}); const room = useRef<Room | null>(null); const sendState = useRef<((d:any)=>void)|null>(null);
  const [, redraw] = useState(0);

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
    let best=-1, dist=Infinity;
    PRACTICE_TARGETS.forEach((p,i)=>{if(!targetAlive.current[i])return; const d=ray.ray.distanceToPoint(new THREE.Vector3(...p)); const along=camera.position.distanceTo(new THREE.Vector3(...p)); if(d<1.1&&along<dist){best=i;dist=along;}});
    Object.entries(peers.current).forEach(([id,p])=>{const d=ray.ray.distanceToPoint(new THREE.Vector3(...p.position).add(new THREE.Vector3(0,1,0)));if(d<1.2){sendState.current?.({hit:id,damage:w.damage,by:name});}});
    if(best>=0){targetAlive.current[best]=false; score.current++; if(score.current%3===0)weapon.current=(weapon.current+1)%WEAPONS.length; ammo.current=WEAPONS[weapon.current].clip; redraw(x=>x+1); onHud({score:score.current,weapon:weapon.current,ammo:ammo.current,hit:true}); window.setTimeout(()=>{targetAlive.current[best]=true;redraw(x=>x+1)},2200);}
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
    const r=joinRoom({appId:"gungame-neon-arena-v1"},roomId); room.current=r;
    const [send,get]=r.makeAction<any>("state"); sendState.current=send;
    get((data,id)=>{if(data.position){peers.current[id]={...data,id};onPeers(Object.values(peers.current));} if(data.hit&&data.hit===selfId){onHud({healthHit:data.damage});}});
    r.onPeerLeave(id=>{delete peers.current[id];onPeers(Object.values(peers.current))});
    return()=>r.leave();
  },[name,onHud,onPeers,roomId]);

  useFrame((_,dt)=>{
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch.current,yaw.current,0,"YXZ")); camera.quaternion.copy(q);
    const forward=new THREE.Vector3(-Math.sin(yaw.current),0,-Math.cos(yaw.current)); const right=new THREE.Vector3(Math.cos(yaw.current),0,-Math.sin(yaw.current));
    const dir=new THREE.Vector3(); if(keys.current.KeyW)dir.add(forward);if(keys.current.KeyS)dir.sub(forward);if(keys.current.KeyD)dir.add(right);if(keys.current.KeyA)dir.sub(right);
    const sprinting=!!(keys.current.ShiftLeft||keys.current.ShiftRight); if(dir.lengthSq())dir.normalize().multiplyScalar((sprinting?10:6)*dt); camera.position.add(dir);
    velocityY.current-=18*dt;camera.position.y+=velocityY.current*dt;if(camera.position.y<1.7){camera.position.y=1.7;velocityY.current=0;grounded.current=true}
    camera.position.x=THREE.MathUtils.clamp(camera.position.x,-15.8,15.8);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-52,5);
    const state={id:selfId,name,position:[camera.position.x,camera.position.y-1.6,camera.position.z] as Vec3,rotation:yaw.current,score:score.current,weapon:weapon.current,moving:dir.lengthSq()>0,sprinting};
    sendState.current?.(state); onHud({sprinting,moving:state.moving,position:state.position});
  });

  return <>
    <MapGeometry map={map}/>
    {PRACTICE_TARGETS.map((p,i)=><PracticeTarget key={i} position={p} alive={targetAlive.current[i]}/>) }
    {Object.values(peers.current).map(p=><FoxPlayer key={p.id} state={p}/>) }
    <WeaponView weapon={weapon.current} reloadTick={reloading.current?1:0} sprinting={!!keys.current.ShiftLeft}/>
  </>;
}

function Leaderboard({ players, you }: { players: PeerState[]; you: {name:string;score:number} }) {
  const list=[{id:"you",name:you.name,score:you.score,weapon:0,position:[0,0,0] as Vec3,rotation:0,moving:false,sprinting:false},...players].sort((a,b)=>b.score-a.score).slice(0,6);
  return <div className="leaderboard" aria-label="Leaderboard">{list.map((p,i)=><div className={`leader ${p.id==="you"?"is-you":""}`} key={p.id}><b>#{i+1}</b><span>{["🦊","🦝","🐯","🐸","🐼","🐵"][i]}</span><strong>{p.score}</strong>{p.id==="you"&&<em>YOU</em>}</div>)}</div>;
}

export default function GameClient(){
  const [phase,setPhase]=useState<"menu"|"playing">("menu"); const [map,setMap]=useState<MapId>("SKYDOCK");
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
    <section className="map-picker"><header><span>CHOOSE THE CHAOS</span><b>3 MAPS</b></header><div className="maps">{MAPS.map((m,i)=><button key={m.id} onClick={()=>setMap(m.id)} className={map===m.id?"active":""} style={{"--accent":m.accent} as any}><i>0{i+1}</i><strong>{m.label}</strong><small>{m.sub}</small><em>SELECTED</em></button>)}</div></section>
    <footer><span>WASD move</span><span>SHIFT sprint</span><span>SPACE jump</span><span>R reload</span><span>CLICK blast</span><a href="https://kenney.nl/assets/blaster-kit" target="_blank">CC0 blasters by Kenney ↗</a></footer>
  </main>;
  const w=WEAPONS[hud.weapon];
  return <main className="game-screen" onClick={e=>{const c=e.currentTarget.querySelector("canvas");c?.requestPointerLock()}}>
    <Canvas shadows camera={{fov:72,near:.1,far:140}}><Suspense fallback={null}><Arena map={map} name={name} roomId={roomCode} onHud={stableHud} onPeers={stablePeers}/></Suspense></Canvas>
    <div className={`hit-flash ${hud.hit?"show":""}`}/><div className="crosshair"><i/><i/></div>
    <div className="topbar"><div className="brand">GUN<span>GAME</span></div><div className="room"><b>{peers.length?`${peers.length+1} PLAYERS`:"PRIVATE LOBBY"}</b><small>{peers.length?"LIVE P2P MATCH":"share code to invite"} · {roomCode}</small></div><div className="timer">{String(Math.floor(time/60)).padStart(2,"0")}:{String(time%60).padStart(2,"0")}</div></div>
    <Leaderboard players={peers} you={{name,score:hud.score}}/>
    <div className="killfeed">{peers.length===0?"No one joined yet — target range is live":"A challenger entered the arena"}</div>
    <div className="weapon-card" style={{"--gun":w.color} as any}><small>NEXT TAG WEAPON</small><b>{w.name}</b><span>“{w.quip}”</span></div>
    <div className="health"><i style={{width:`${hud.health}%`}}/><b>{hud.health}</b><span>HP</span></div>
    <div className="ammo"><span>{hud.reloading?"RELOADING…":w.name}</span><b>{hud.ammo}</b><small>/ {w.clip}</small></div>
    <button className="escape" onClick={e=>{e.stopPropagation();document.exitPointerLock();setPhase("menu")}}>ESC · MENU</button>
    <div className="click-to-play">CLICK TO LOCK AIM · WASD TO MOVE</div>
  </main>;
}

useGLTF.preload("/models/fox.glb"); WEAPONS.forEach(w=>useGLTF.preload(w.model));
