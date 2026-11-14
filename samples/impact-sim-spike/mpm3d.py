# 충돌 시뮬레이션 가능성 시험 (2026-11-14, 시안): 3D MLS-MPM, z = zsym 대칭면의 반쪽만 계산. 재료 모형은 mpm.mjs 와 같습니다.
# Taichi 1.7.4 (CPU) 가 필요합니다: 저장소 밖 venv 에 pip install taichi numpy. 대칭면 옆 한 겹의 입자만 저장해 render.mjs 로 단면을 그립니다.
# usage: python mpm3d.py OUT [dx_mm=0.75] [bench_steps=0]
import sys, os, json, time
import numpy as np
import taichi as ti

out = sys.argv[1]
dx = float(sys.argv[2]) * 1e-3 if len(sys.argv) > 2 else 0.75e-3
bench = int(sys.argv[3]) if len(sys.argv) > 3 else 0
os.makedirs(out, exist_ok=True)
ti.init(arch=ti.cpu, default_fp=ti.f64, cpu_max_num_threads=4)

Wm, Hm, Zm = 0.10, 0.085, 0.03
inv_dx = 1.0 / dx
nx, ny, nz = int(round(Wm / dx)) + 1, int(round(Hm / dx)) + 1, int(round(Zm / dx)) + 1
V0, ang = 1500.0, np.radians(60.0)
plate_t, plate_top = 0.025, 0.045
rodL, rodD = 0.05, 0.005
Tend, n_frames = 110e-6, 80
zsym = 3 * dx

RHO = [7850.0, 17600.0]; KK = [165e9, 290e9]; GG = [80e9, 140e9]; YY = [1.0e9, 1.5e9]
CP = [470.0, 134.0]; TM = [1800.0, 1723.0]; EF = [1.5, 1.0]
cs = [np.sqrt((KK[i] + 4 * GG[i] / 3) / RHO[i]) for i in range(2)]
dt = 0.25 * dx / (max(cs) + V0)
n_steps = int(np.ceil(Tend / dt))
frame_every = max(1, n_steps // n_frames)

sp = dx / 2
vol0 = sp ** 3
def lattice(x0, x1, y0, y1, z0, z1):
    xs = np.arange(x0 + sp / 2, x1, sp); ys = np.arange(y0 + sp / 2, y1, sp); zs = np.arange(z0 + sp / 2, z1, sp)
    g = np.stack(np.meshgrid(xs, ys, zs, indexing='ij'), -1).reshape(-1, 3)
    return g
m3 = 3 * dx
plate = lattice(m3, Wm - m3, plate_top - plate_t, plate_top, zsym, Zm - m3)
dirv = np.array([np.sin(ang), -np.cos(ang), 0.0])
nose = np.array([Wm / 2 + 0.006, plate_top + 0.0015, zsym])
box = lattice(m3, Wm - m3, plate_top, Hm - m3, zsym, zsym + rodD)
rel = box - nose
s_ax = -(rel @ dirv)
perp = rel + np.outer(s_ax, dirv)
r = np.linalg.norm(perp, axis=1)
nose_len = rodD * 1.5
half = np.where(s_ax < nose_len, (rodD / 2) * (0.25 + 0.75 * np.clip(s_ax, 0, None) / nose_len), rodD / 2)
rod = box[(s_ax >= 0) & (s_ax <= rodL) & (r <= half)]
X0 = np.concatenate([plate, rod]); M0 = np.concatenate([np.zeros(len(plate), np.int32), np.ones(len(rod), np.int32)])
n = len(X0)
Vinit = np.zeros((n, 3)); Vinit[len(plate):] = V0 * dirv
slab = np.where(X0[:, 2] < zsym + dx)[0]  # Lagrangian slab next to the symmetry plane → cut view
print(f'grid {nx}x{ny}x{nz}, particles {n} (rod {len(rod)}), slab {len(slab)}, dt {dt*1e9:.2f} ns, steps {n_steps}', flush=True)

x = ti.Vector.field(3, float, n); v = ti.Vector.field(3, float, n); C = ti.Matrix.field(3, 3, float, n); s = ti.Matrix.field(3, 3, float, n)
J = ti.field(float, n); eps = ti.field(float, n); Tk = ti.field(float, n); q = ti.field(float, n); seqf = ti.field(float, n); prf = ti.field(float, n)
mat = ti.field(ti.i32, n); state = ti.field(ti.i32, n)
grid_v = ti.Vector.field(3, float, (nx, ny, nz)); grid_m = ti.field(float, (nx, ny, nz))
rho_f = ti.field(float, 2); K_f = ti.field(float, 2); G_f = ti.field(float, 2); Y_f = ti.field(float, 2); cp_f = ti.field(float, 2); tm_f = ti.field(float, 2); ef_f = ti.field(float, 2); c_f = ti.field(float, 2)
for i in range(2):
    rho_f[i] = RHO[i]; K_f[i] = KK[i]; G_f[i] = GG[i]; Y_f[i] = YY[i]; cp_f[i] = CP[i]; tm_f[i] = TM[i]; ef_f[i] = EF[i]; c_f[i] = cs[i]
x.from_numpy(X0); v.from_numpy(Vinit); mat.from_numpy(M0)
J.fill(1.0); Tk.fill(300.0); state.fill(1)
lo = ti.Vector([2 * dx, 2 * dx, 2 * dx]); hi = ti.Vector([Wm - 2 * dx, Hm - 2 * dx, Zm - 2 * dx])

@ti.kernel
def substep():
    for I in ti.grouped(grid_m):
        grid_v[I] = ti.Vector.zero(float, 3); grid_m[I] = 0.0
    for p in x:
        if state[p] == 0:
            continue
        Xp = x[p] * inv_dx
        base = ti.cast(ti.floor(Xp - 0.5), ti.i32)
        fx = Xp - ti.cast(base, float)
        w = [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1.0) ** 2, 0.5 * (fx - 0.5) ** 2]
        m = mat[p]
        pm = rho_f[m] * vol0
        pr = K_f[m] * (1.0 / J[p] - 1.0) + q[p]
        if state[p] == 2 and pr < 0:
            pr = 0.0
        prf[p] = pr
        sig = s[p] - pr * ti.Matrix.identity(float, 3)
        affine = (-dt * vol0 * J[p] * 4 * inv_dx * inv_dx) * sig + pm * C[p]
        for i, j, k in ti.static(ti.ndrange(3, 3, 3)):
            off = ti.Vector([i, j, k])
            dpos = (ti.cast(off, float) - fx) * dx
            wt = w[i][0] * w[j][1] * w[k][2]
            grid_v[base + off] += wt * (pm * v[p] + affine @ dpos)
            grid_m[base + off] += wt * pm
    for I in ti.grouped(grid_m):
        if grid_m[I] > 0:
            grid_v[I] /= grid_m[I]
            if I[0] < 3 or I[0] > nx - 4 or I[2] > nz - 4:
                grid_v[I] = ti.Vector.zero(float, 3)
            if I[2] <= 3:
                grid_v[I][2] = 0.0
    for p in x:
        if state[p] == 0:
            continue
        Xp = x[p] * inv_dx
        base = ti.cast(ti.floor(Xp - 0.5), ti.i32)
        fx = Xp - ti.cast(base, float)
        w = [0.5 * (1.5 - fx) ** 2, 0.75 - (fx - 1.0) ** 2, 0.5 * (fx - 0.5) ** 2]
        nv = ti.Vector.zero(float, 3); nC = ti.Matrix.zero(float, 3, 3)
        for i, j, k in ti.static(ti.ndrange(3, 3, 3)):
            off = ti.Vector([i, j, k])
            dpos = (ti.cast(off, float) - fx) * dx
            wt = w[i][0] * w[j][1] * w[k][2]
            gv = grid_v[base + off]
            nv += wt * gv
            nC += 4 * inv_dx * inv_dx * wt * gv.outer_product(dpos)
        v[p] = nv; C[p] = nC
        x[p] += dt * nv
        if x[p][2] < zsym:
            x[p][2] = zsym
        if (x[p] < lo).any() or (x[p] > hi).any():
            state[p] = 0
            continue
        m = mat[p]
        trD = nC.trace()
        Jn = ti.max(J[p] * (1.0 + dt * trD), 0.3)
        if state[p] == 2 and Jn > 1.0:
            Jn = 1.0
        J[p] = Jn
        rho = rho_f[m] / Jn
        q[p] = 0.0
        if trD < 0:
            q[p] = rho * (0.15 * c_f[m] * dx * -trD + 1.5 * dx * dx * trD * trD)
        if state[p] == 2:
            s[p] = ti.Matrix.zero(float, 3, 3); seqf[p] = 0.0
        else:
            D = 0.5 * (nC + nC.transpose()); W = 0.5 * (nC - nC.transpose())
            sn = s[p] + dt * (2 * G_f[m] * (D - trD / 3 * ti.Matrix.identity(float, 3)) + W @ s[p] - s[p] @ W)
            seq = ti.sqrt(1.5 * (sn * sn).sum())
            Yc = Y_f[m] * ti.max(0.05, 1.0 - (Tk[p] - 300.0) / (tm_f[m] - 300.0))
            if seq > Yc:
                sn *= Yc / seq
                de = (seq - Yc) / (3 * G_f[m])
                eps[p] += de
                Tk[p] += 0.9 * Yc * de / (rho * cp_f[m])
                if eps[p] > ef_f[m]:
                    state[p] = 2
                seqf[p] = Yc
            else:
                seqf[p] = seq
            s[p] = sn

meta = dict(axi=False, dx=dx, Wm=Wm, Hm=Hm, n=int(len(slab)), layers=2, dt=dt, nSteps=n_steps, rodL=rodL, rodD=rodD, V0=V0,
            mats=[dict(Y=YY[0]), dict(Y=YY[1])], frames=[], nAll=int(n))
def dump(k):
    X = x.to_numpy()[slab]; V = v.to_numpy()[slab]
    b = np.zeros((len(slab), 10), np.float32)
    b[:, 0] = X[:, 0]; b[:, 1] = X[:, 1]; b[:, 2] = V[:, 0]; b[:, 3] = V[:, 1]
    b[:, 4] = eps.to_numpy()[slab]; b[:, 5] = Tk.to_numpy()[slab]; b[:, 6] = seqf.to_numpy()[slab]; b[:, 7] = prf.to_numpy()[slab]
    b[:, 8] = M0[slab]; b[:, 9] = state.to_numpy()[slab]
    name = f'f_{k:04d}.bin'; b.tofile(os.path.join(out, name)); meta['frames'].append(name)

substep(); ti.sync()  # compile
if bench:
    t0 = time.time()
    for _ in range(bench): substep()
    ti.sync(); el = time.time() - t0
    print(f'bench: {bench} steps in {el:.1f}s → {n*bench/el/1e6:.1f} M particle-steps/s; full run est {n_steps*el/bench/60:.1f} min', flush=True)
    sys.exit(0)
t0 = time.time(); k = 0; dump(k); k += 1
for st in range(1, n_steps + 1):
    substep()
    if st % frame_every == 0:
        dump(k); k += 1
        if k % 10 == 0: print(f't={st*dt*1e6:.1f}us wall={time.time()-t0:.0f}s', flush=True)
meta['wallSec'] = time.time() - t0
meta['particleStepsPerSec'] = n * n_steps / meta['wallSec']
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(f"done {meta['wallSec']:.0f}s, {meta['particleStepsPerSec']/1e6:.1f} M particle-steps/s", flush=True)
