// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type RouteName = 'welcome' | 'explore' | 'reflect'

const ROUTES: Record<RouteName, THREE.Vector3[]> = {
  welcome: [new THREE.Vector3(-6, 0, 4), new THREE.Vector3(-2, 0, 1), new THREE.Vector3(0, 0, -1)],
  explore: [new THREE.Vector3(-6, 0, 4), new THREE.Vector3(-2, 0, 2), new THREE.Vector3(2, 0, 1), new THREE.Vector3(5, 0, -2)],
  reflect: [new THREE.Vector3(-6, 0, 4), new THREE.Vector3(-1, 0, 4), new THREE.Vector3(2, 0, 2), new THREE.Vector3(0, 0, -4)],
}

export default function GuidedLearningWorld() {
  const mountRef = useRef<HTMLDivElement>(null)
  const routeApi = useRef<((points: THREE.Vector3[]) => void) | null>(null)
  const [instruction, setInstruction] = useState('Draw a path on the floor, or choose a guided route.')
  const [station, setStation] = useState(0)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#07121a')
    scene.fog = new THREE.FogExp2('#07121a', 0.035)

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)
    camera.position.set(0, 11, 15)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = !reduceMotion
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.setAttribute('aria-label', 'Interactive guided learning world. Draw a route for the learner avatar.')
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:crosshair'
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#b8e8ff', '#13231d', 2.2))
    const key = new THREE.DirectionalLight('#fff2c7', 3.5)
    key.position.set(5, 12, 7)
    key.castShadow = !reduceMotion
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(13, 64),
      new THREE.MeshStandardMaterial({ color: '#10262a', roughness: 0.78, metalness: 0.08 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const grid = new THREE.GridHelper(22, 22, '#346b68', '#173938')
    grid.position.y = 0.012
    scene.add(grid)

    const stations = [
      { n: 1, label: 'START', position: new THREE.Vector3(-6, 0, 4), colour: '#67e8c2' },
      { n: 2, label: 'EXPLORE', position: new THREE.Vector3(5, 0, -2), colour: '#74b9ff' },
      { n: 3, label: 'REFLECT', position: new THREE.Vector3(0, 0, -4), colour: '#f2c879' },
    ]

    const makeLabel = (text: string, colour: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 160
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'rgba(4,12,18,.88)'
      ctx.roundRect(8, 8, 496, 144, 30)
      ctx.fill()
      ctx.strokeStyle = colour
      ctx.lineWidth = 7
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 48px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 256, 82)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
      sprite.scale.set(4.5, 1.4, 1)
      return sprite
    }

    stations.forEach(({ n, label, position, colour }) => {
      const group = new THREE.Group()
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 1.02, 48),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.03
      group.add(ring)
      const stop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.44, 0.08, 32),
        new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.38 }),
      )
      stop.position.y = 0.04
      group.add(stop)
      const labelSprite = makeLabel(`${n} · ${label}`, colour)
      labelSprite.position.y = 2.1
      group.add(labelSprite)
      group.position.copy(position)
      scene.add(group)
    })

    const avatar = new THREE.Group()
    avatar.position.copy(stations[0].position)
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#e7f5ee', roughness: 0.68 })
    const accentMaterial = new THREE.MeshStandardMaterial({ color: '#53d3ad', roughness: 0.55 })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.05, 8, 16), bodyMaterial)
    body.position.y = 1.48
    body.castShadow = true
    avatar.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 18), bodyMaterial)
    head.position.y = 2.62
    head.castShadow = true
    avatar.add(head)

    const makeLimb = (x: number, y: number, length: number, material: THREE.Material) => {
      const pivot = new THREE.Group()
      pivot.position.set(x, y, 0)
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, length, 6, 10), material)
      limb.position.y = -length * 0.5
      limb.castShadow = true
      pivot.add(limb)
      avatar.add(pivot)
      return pivot
    }

    // Arms begin in a relaxed, slightly bent-looking pose and swing opposite the legs.
    const leftArm = makeLimb(-0.58, 1.94, 0.82, accentMaterial)
    const rightArm = makeLimb(0.58, 1.94, 0.82, accentMaterial)
    leftArm.rotation.z = -0.17
    rightArm.rotation.z = 0.17
    leftArm.rotation.x = 0.12
    rightArm.rotation.x = -0.12
    const leftLeg = makeLimb(-0.25, 0.96, 0.82, bodyMaterial)
    const rightLeg = makeLimb(0.25, 0.96, 0.82, bodyMaterial)
    scene.add(avatar)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let drawing = false
    let drawPoints: THREE.Vector3[] = []
    let preview: THREE.Line | null = null
    let activeLine: THREE.Line | null = null
    let activeCurve: THREE.CatmullRomCurve3 | null = null
    let travelled = 0
    let totalLength = 0
    let lastTime = performance.now()
    let disposed = false

    const pointFromEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const target = new THREE.Vector3()
      return raycaster.ray.intersectPlane(plane, target) ? target : null
    }

    const makeRouteLine = (points: THREE.Vector3[], colour = '#65f2ca') => {
      const curve = new THREE.CatmullRomCurve3(points)
      const sampled = curve.getPoints(Math.max(32, points.length * 18)).map((point) => point.clone().setY(0.08))
      const geometry = new THREE.BufferGeometry().setFromPoints(sampled)
      const material = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.95 })
      return { curve, line: new THREE.Line(geometry, material) }
    }

    const beginRoute = (points: THREE.Vector3[]) => {
      if (points.length < 2) return
      if (activeLine) {
        scene.remove(activeLine)
        activeLine.geometry.dispose()
        ;(activeLine.material as THREE.Material).dispose()
      }
      const route = makeRouteLine(points)
      activeCurve = route.curve
      activeLine = route.line
      scene.add(activeLine)
      travelled = 0
      totalLength = activeCurve.getLength()
      setInstruction(reduceMotion ? 'Route selected. Use the station buttons to move step by step.' : 'Follow the glowing line. Stop at each numbered station.')
    }
    routeApi.current = beginRoute

    const onPointerDown = (event: PointerEvent) => {
      const point = pointFromEvent(event)
      if (!point) return
      renderer.domElement.setPointerCapture(event.pointerId)
      drawing = true
      drawPoints = [point]
      setInstruction('Keep drawing the route. Release to begin walking.')
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drawing) return
      const point = pointFromEvent(event)
      if (!point) return
      const previous = drawPoints[drawPoints.length - 1]
      if (previous.distanceTo(point) < 0.28) return
      drawPoints.push(point)
      if (preview) {
        scene.remove(preview)
        preview.geometry.dispose()
        ;(preview.material as THREE.Material).dispose()
      }
      preview = makeRouteLine(drawPoints, '#d8f9ee').line
      scene.add(preview)
    }

    const onPointerUp = () => {
      if (!drawing) return
      drawing = false
      if (preview) {
        scene.remove(preview)
        preview.geometry.dispose()
        ;(preview.material as THREE.Material).dispose()
        preview = null
      }
      if (drawPoints.length >= 3) beginRoute(drawPoints)
      else setInstruction('That path was too short. Draw a longer route.')
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const clock = new THREE.Clock()
    const animate = (now: number) => {
      if (disposed) return
      requestAnimationFrame(animate)
      const delta = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      const elapsed = clock.getElapsedTime()

      if (activeCurve && !reduceMotion && travelled < totalLength) {
        travelled = Math.min(totalLength, travelled + delta * 2.25)
        const u = totalLength ? travelled / totalLength : 1
        const position = activeCurve.getPointAt(u)
        const tangent = activeCurve.getTangentAt(Math.min(0.999, u))
        avatar.position.copy(position)
        avatar.rotation.y = Math.atan2(tangent.x, tangent.z)
        const stride = Math.sin(elapsed * 8) * 0.48
        leftArm.rotation.x = 0.12 + stride
        rightArm.rotation.x = -0.12 - stride
        leftLeg.rotation.x = -stride * 0.82
        rightLeg.rotation.x = stride * 0.82
        body.position.y = 1.48 + Math.abs(Math.sin(elapsed * 8)) * 0.055

        stations.forEach((item, index) => {
          if (position.distanceTo(item.position) < 1.05 && station !== index + 1) {
            setStation(index + 1)
            setInstruction(`Stop ${index + 1}: ${item.label}. Complete this learning step before continuing.`)
          }
        })

        if (u >= 1) {
          leftArm.rotation.x = 0.12
          rightArm.rotation.x = -0.12
          leftLeg.rotation.x = 0
          rightLeg.rotation.x = 0
          setInstruction('Route complete. Choose another route or draw your own.')
        }
      }

      renderer.render(scene, camera)
    }
    requestAnimationFrame(animate)

    return () => {
      disposed = true
      observer.disconnect()
      routeApi.current = null
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      scene.traverse((object: any) => {
        object.geometry?.dispose?.()
        if (Array.isArray(object.material)) object.material.forEach((material: THREE.Material) => material.dispose())
        else object.material?.dispose?.()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  const chooseRoute = (name: RouteName) => {
    routeApi.current?.(ROUTES[name].map((point) => point.clone()))
    setStation(0)
  }

  return (
    <section
      aria-labelledby="guided-world-title"
      style={{
        marginTop: 28,
        border: '1px solid rgba(103,232,194,.3)',
        borderRadius: 22,
        overflow: 'hidden',
        background: '#07121a',
        boxShadow: '0 24px 80px rgba(0,0,0,.35)',
      }}
    >
      <div style={{ padding: '18px 18px 14px', display: 'flex', gap: 16, alignItems: 'start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <p style={{ color: '#67e8c2', fontSize: 10, letterSpacing: '.16em', margin: 0 }}>GUIDED LEARNING WORLD</p>
          <h2 id="guided-world-title" style={{ fontFamily: 'Georgia, serif', fontSize: 29, margin: '6px 0' }}>See where to go. Know when to stop.</h2>
          <p aria-live="polite" style={{ color: '#b9cac6', margin: 0, maxWidth: 680 }}>{instruction}</p>
        </div>
        <span style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '8px 12px', color: '#dff8f0', fontSize: 12 }}>
          {station ? `At station ${station}` : 'Ready'}
        </span>
      </div>

      <div ref={mountRef} style={{ height: 'clamp(360px,58vw,620px)', position: 'relative' }} />

      <nav aria-label="Guided routes" style={{ padding: 14, display: 'flex', gap: 9, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <button onClick={() => chooseRoute('welcome')} style={routeButton}>1 · Start route</button>
        <button onClick={() => chooseRoute('explore')} style={routeButton}>2 · Explore route</button>
        <button onClick={() => chooseRoute('reflect')} style={routeButton}>3 · Reflect route</button>
      </nav>
    </section>
  )
}

const routeButton: React.CSSProperties = {
  border: '1px solid rgba(103,232,194,.34)',
  borderRadius: 999,
  padding: '10px 15px',
  color: '#eafff8',
  background: 'rgba(103,232,194,.1)',
  fontWeight: 800,
  cursor: 'pointer',
}
