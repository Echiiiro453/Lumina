/**
 * Otimizador Racional de Maior Grau para F2(x)
 */

const Math_PI = Math.PI;

function F1(x) {
  const absX = Math.abs(x);
  if (absX > 20) return absX - Math.log(2);
  return Math.log(Math.cosh(x));
}

function integrateF1(x, steps = 50000) {
  const h = x / steps;
  let sum = 0.5 * (F1(0) + F1(x));
  for (let i = 1; i < steps; i++) {
    sum += F1(i * h);
  }
  return sum * h;
}

const N = 200;
const xs = [];
const ys = [];
for (let i = 0; i < N; i++) {
  const x = 0.01 + i * (4.0 / N);
  xs.push(x);
  ys.push(integrateF1(x));
}

function evalRational(x, p) {
  const [a1, a2, a3, b1, b2, b3, b4] = p;
  const x2 = x * x;
  const num = 1/6 + a1 * x2 + a2 * x2 * x2 + a3 * x2 * x2 * x2;
  const den = 1 + b1 * x2 + b2 * x2 * x2 + b3 * x2 * x2 * x2 + b4 * x2 * x2 * x2 * x2;
  return x * x2 * (num / den);
}

function getMaxError(p) {
  let maxErr = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const target = ys[i];
    const pred = evalRational(x, p);
    const err = Math.abs(pred - target);
    if (err > maxErr) maxErr = err;
  }
  return maxErr;
}

let bestParams = null;
let bestErr = Infinity;

// 120 runs independentes
for (let run = 0; run < 120; run++) {
  let params = [
    (Math.random() - 0.5) * 0.1,  // a1
    (Math.random() - 0.5) * 0.01, // a2
    (Math.random() - 0.5) * 0.001,// a3
    Math.random() * 0.5,          // b1
    Math.random() * 0.05,         // b2
    Math.random() * 0.005,        // b3
    Math.random() * 0.0005        // b4
  ];
  
  let err = getMaxError(params);
  let stepSize = 0.05;
  
  for (let iter = 0; iter < 5000; iter++) {
    let improved = false;
    for (let i = 0; i < params.length; i++) {
      for (let sign of [-1, 1]) {
        const nextParams = [...params];
        nextParams[i] += sign * stepSize * (Math.random() * 0.5 + 0.5);
        
        // Enforçar positividade do denominador
        if (i >= 3 && nextParams[i] < 1e-9) continue;
        
        const nextErr = getMaxError(nextParams);
        if (nextErr < err) {
          err = nextErr;
          params = nextParams;
          improved = true;
        }
      }
    }
    if (!improved) {
      stepSize *= 0.9;
      if (stepSize < 1e-13) break;
    }
  }
  
  if (err < bestErr) {
    bestErr = err;
    bestParams = params;
    console.log(`[Run ${run}] Novo melhor erro: ${bestErr.toExponential(4)}`);
  }
}

const params = bestParams;
console.log("\nMelhores parâmetros finais (Grau Superior):");
console.log(`a1 = ${params[0].toFixed(15)}`);
console.log(`a2 = ${params[1].toFixed(15)}`);
console.log(`a3 = ${params[2].toFixed(15)}`);
console.log(`b1 = ${params[3].toFixed(15)}`);
console.log(`b2 = ${params[4].toFixed(15)}`);
console.log(`b3 = ${params[5].toFixed(15)}`);
console.log(`b4 = ${params[6].toFixed(15)}`);
console.log(`Erro absoluto máximo final: ${bestErr.toExponential(4)}`);
