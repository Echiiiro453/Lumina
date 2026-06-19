/**
 * Mínimos Quadrados com M=6 para F2(x) de tanh(x)
 */

const Math_PI = Math.PI;
const C_const = (Math_PI * Math_PI) / 24;

function F1(x) {
  const absX = Math.abs(x);
  if (absX > 20) return absX - Math.log(2);
  return Math.log(Math.cosh(x));
}

function integrateF1(x, steps = 100000) {
  const h = x / steps;
  let sum = 0.5 * (F1(0) + F1(x));
  for (let i = 1; i < steps; i++) {
    sum += F1(i * h);
  }
  return sum * h;
}

const N = 400;
const xs = new Float64Array(N);
const ys = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const x = 0.01 + i * (4.0 / N);
  xs[i] = x;
  ys[i] = integrateF1(x);
}

const M = 6;
const A = Array.from({ length: N }, () => new Float64Array(M));
const B = new Float64Array(N);

for (let i = 0; i < N; i++) {
  const x = xs[i];
  B[i] = ys[i] - (x * x * x / 6.0);
  for (let j = 0; j < M; j++) {
    const power = 5 + 2 * j;
    A[i][j] = Math.pow(x, power);
  }
}

const ATA = Array.from({ length: M }, () => new Float64Array(M));
const ATB = new Float64Array(M);

for (let j = 0; j < M; j++) {
  for (let k = 0; k < M; k++) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sum += A[i][j] * A[i][k];
    }
    ATA[j][k] = sum;
  }
  let sumB = 0;
  for (let i = 0; i < N; i++) {
    sumB += A[i][j] * B[i];
  }
  ATB[j] = sumB;
}

function solveLinearSystem(Matrix, Vector) {
  const size = Vector.length;
  const M_copy = Array.from({ length: size }, (_, r) => new Float64Array([...Matrix[r]]));
  const V_copy = new Float64Array([...Vector]);

  for (let i = 0; i < size; i++) {
    let maxRow = i;
    for (let r = i + 1; r < size; r++) {
      if (Math.abs(M_copy[r][i]) > Math.abs(M_copy[maxRow][i])) {
        maxRow = r;
      }
    }
    const tempM = M_copy[i]; M_copy[i] = M_copy[maxRow]; M_copy[maxRow] = tempM;
    const tempV = V_copy[i]; V_copy[i] = V_copy[maxRow]; V_copy[maxRow] = tempV;

    const pivot = M_copy[i][i];
    for (let j = i; j < size; j++) M_copy[i][j] /= pivot;
    V_copy[i] /= pivot;

    for (let r = i + 1; r < size; r++) {
      const factor = M_copy[r][i];
      for (let c = i; c < size; c++) {
        M_copy[r][c] -= factor * M_copy[i][c];
      }
      V_copy[r] -= factor * V_copy[i];
    }
  }

  const solution = new Float64Array(size);
  for (let i = size - 1; i >= 0; i--) {
    let sum = V_copy[i];
    for (let j = i + 1; j < size; j++) {
      sum -= M_copy[i][j] * solution[j];
    }
    solution[i] = sum;
  }
  return solution;
}

const d = solveLinearSystem(ATA, ATB);

console.log("Melhores coeficientes para M=6:");
for (let j = 0; j < M; j++) {
  console.log(`d${j+1} = ${d[j].toFixed(15)}`);
}

function F2_approx(x) {
  const absX = Math.abs(x);
  const sign = x < 0 ? -1 : 1;
  if (absX > 4.0) {
    return sign * (0.5 * absX * absX - Math.log(2) * absX + C_const);
  }
  const x2 = absX * absX;
  const poly = 1/6 + d[0]*x2 + d[1]*x2*x2 + d[2]*x2*x2*x2 + d[3]*x2*x2*x2*x2 + d[4]*x2*x2*x2*x2*x2 + d[5]*x2*x2*x2*x2*x2*x2;
  return sign * x2 * absX * poly;
}

console.log("\nVerificação de erro máximo para M=6:");
let maxFinalErr = 0;
let maxErrAt = 0;
for (let val = 0.0; val <= 25.0; val += 0.01) {
  const exact = integrateF1(val);
  const approx = F2_approx(val);
  const err = Math.abs(approx - exact);
  if (err > maxFinalErr) {
    maxFinalErr = err;
    maxErrAt = val;
  }
}
console.log(`Erro absoluto máximo final: ${maxFinalErr.toExponential(4)} no ponto x = ${maxErrAt}`);
