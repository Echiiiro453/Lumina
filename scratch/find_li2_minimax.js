const fs = require('fs');

function exactLi2(z) {
  if (z === 0) return 0;
  let sum = 0;
  for (let n = 1; n <= 1000; n++) {
    sum += Math.pow(z, n) / (n * n);
  }
  return sum;
}

const targetAtMinusOne = -Math.PI * Math.PI / 12; // -0.8224670334241132

const samples = [];
for (let i = 0; i <= 500; i++) {
  const z = -i / 500;
  samples.push({ z, val: exactLi2(z) });
}

let coeffs = [1.0, 0.25, 0.1111111, 0.0625, 0.04, 0.0277778, 0.0204]; // 7 coefficients

function evaluate(z, c) {
  let sum = 0;
  let currentZ = z;
  for (let i = 0; i < c.length; i++) {
    sum += c[i] * currentZ;
    currentZ *= z;
  }
  return sum;
}

let bestCoeffs = [...coeffs];
let minMaxError = 1e9;

function project(c) {
  // c[0] - c[1] + c[2] - c[3] + c[4] - c[5] + c[6] = targetAtMinusOne
  let sumWithoutLast = 0;
  let sign = -1;
  for (let i = 0; i < c.length - 1; i++) {
    sumWithoutLast += c[i] * sign;
    sign = -sign;
  }
  c[c.length - 1] = (targetAtMinusOne - sumWithoutLast) / sign;
}

project(bestCoeffs);

for (let iter = 0; iter < 1000000; iter++) {
  const testCoeffs = bestCoeffs.map(x => x + (Math.random() - 0.5) * 5e-6);
  project(testCoeffs);

  let maxErr = 0;
  for (const s of samples) {
    const err = Math.abs(evaluate(s.z, testCoeffs) - s.val);
    if (err > maxErr) maxErr = err;
  }

  if (maxErr < minMaxError) {
    minMaxError = maxErr;
    bestCoeffs = testCoeffs;
  }
}

console.log("Melhores coeficientes encontrados (7 termos):");
bestCoeffs.forEach((c, idx) => {
  console.log(`  c${idx + 1}: ${c.toFixed(15)}`);
});
console.log("Erro máximo absoluto:", minMaxError);
console.log("Valor em z = -1:", evaluate(-1, bestCoeffs), "Esperado:", targetAtMinusOne);
