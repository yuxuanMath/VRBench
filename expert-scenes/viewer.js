const viewport = document.querySelector('#viewport');
const status = document.querySelector('#status');
async function load() {
  const task = new URLSearchParams(location.search).get('task');
  if (!/^[ACX]\d{2}$/.test(task)) throw Error('Unknown task');
  const response = await fetch(task + '.json');
  if (!response.ok) throw Error('Missing scene');
  const data = await response.json();
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewport.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeff3f7);
  const camera = new THREE.PerspectiveCamera(40,1,.005,50);
  camera.up.set(0,0,1);
  const controls = new THREE.OrbitControls(camera,renderer.domElement);
  const draw = () => renderer.render(scene,camera);
  scene.add(new THREE.HemisphereLight(0xffffff,0x8090a4,1.5));
  const sun = new THREE.DirectionalLight(0xffffff,1.3);
  sun.position.set(3,-4,6);scene.add(sun);
  function addMesh(mesh,color,opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));
    geo.setIndex(mesh.indices);geo.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color,opacity,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const object=new THREE.Mesh(geo,material);
    scene.add(object);
    return object;
  }
  const surroundings=Object.entries(data.geometry).map(([category,mesh])=>
    addMesh(mesh,category==='object'?0xce956d:0xabb7c0,.3));
  const links=data.links.map(mesh=>addMesh(mesh,0x596d81,.85));
  const points = data.expert.map(p=>new THREE.Vector3(...p));
  const box = new THREE.Box3().setFromPoints(points);
  const scale = Math.max(.36,box.getSize(new THREE.Vector3()).length());
  const pathMaterial = new THREE.MeshBasicMaterial({color:0x145bc1,depthTest:false});
  const trace = new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,8),pathMaterial,points.length-1);
  const axis = new THREE.Vector3(0,1,0);
  const piece = new THREE.Object3D();
  let count = 0;
  for (let i=1;i<points.length;i++) {
    const delta = points[i].clone().sub(points[i-1]);
    const length = delta.length();
    if (length < 1e-8) continue;
    piece.position.copy(points[i-1]).lerp(points[i],.5);
    piece.quaternion.setFromUnitVectors(axis,delta.normalize());
    piece.scale.set(scale*.003,length,scale*.003);
    piece.updateMatrix();
    trace.setMatrixAt(count++,piece.matrix);
  }
  trace.count=count;trace.renderOrder=4;
  // Draw after the translucent scene so the full recorded path stays legible.
  pathMaterial.transparent=true;scene.add(trace);
  const center=box.getCenter(new THREE.Vector3());
  function reset(){
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(1.2,-1.45,1),scale);
    controls.update();draw();
  }
  controls.minDistance=.08;controls.maxDistance=15;
  controls.addEventListener('change',draw);
  document.querySelector('#reset').onclick=reset;
  viewport.addEventListener('keydown',event=>{
    const offset=camera.position.clone().sub(controls.target);
    const spherical=new THREE.Spherical().setFromVector3(offset.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(camera.up,axis)));
    switch(event.key){
      case 'ArrowLeft': spherical.theta-=.12;break;
      case 'ArrowRight': spherical.theta+=.12;break;
      case 'ArrowUp': spherical.phi-=.12;break;
      case 'ArrowDown': spherical.phi+=.12;break;
      case '+':case '=': spherical.radius*=.88;break;
      case '-': spherical.radius/=.88;break;
      default:return;
    }
    event.preventDefault();spherical.makeSafe();
    offset.setFromSpherical(spherical).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis,camera.up));
    camera.position.copy(controls.target).add(offset);controls.update();
  });
  new ResizeObserver(()=>{
    const {clientWidth:w,clientHeight:h}=viewport;
    if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();
  }).observe(viewport);
  const marker=new THREE.Mesh(new THREE.SphereGeometry(scale*.011,16,12),
    new THREE.MeshBasicMaterial({color:0x163f84,depthTest:false,transparent:true}));
  marker.renderOrder=5;scene.add(marker);
  const frame=document.querySelector('#frame');
  frame.max=String(data.poses.length-1);
  function showFrame(){
    const index=frame.valueAsNumber;
    const pose=data.poses[index];
    links.forEach((link,i)=>{
      link.position.fromArray(pose,i*7);
      link.quaternion.fromArray(pose,i*7+3).normalize();
    });
    marker.position.copy(points[index]);
    const label=(index+1)+' / '+points.length;
    document.querySelector('#frame-value').textContent=label;
    frame.setAttribute('aria-valuetext','Frame '+label);
    draw();
  }
  frame.addEventListener('input',showFrame);
  const opacity=document.querySelector('#opacity');
  opacity.addEventListener('input',()=>{
    for(const object of surroundings){
      object.material.opacity=opacity.valueAsNumber/100;
      object.visible=opacity.valueAsNumber>0;
    }
    document.querySelector('#opacity-value').textContent=opacity.value+'%';
    draw();
  });
  frame.disabled=false;opacity.disabled=false;showFrame();
  reset();status.hidden=true;
}
load().catch(err=>{console.error(err);status.textContent='3D view unavailable. Check WebGL support and reload.';});
