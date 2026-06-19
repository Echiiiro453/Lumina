/**
 * Validação de Continuidade C2 na transição de F2(x)
 */

function F2(x) {
  const absX = Math.abs(x);
  const sign = x < 0 ? -1 : 1;
  
  if (absX < 3.0) {
    const x2 = absX * absX;
    const poly = 0.16666666666666666 + 
                 (-0.015721374275200) * x2 + 
                 0.002144118674013 * x2 * x2 + 
                 (-0.000226532477518) * x2 * x2 * x2 + 
                 0.000015206257921 * x2 * x2 * x2 * x2 + 
                 (-0.000000563415316) * x2 * x2 * x2 * x2 * x2 + 
                 0.000000008714110 * x2 * x2 * x2 * x2 * x2 * x2;
    return sign * x2 * absX * poly;
  }
  
  if (absX > 4.0) {
    return sign * (0.5 * absX * absX - 0.6931471805599453 * absX + 0.4112335167120563);
  }
  
  const t = absX - 3.0;
  const t3 = t * t * t;
  const w = t3 * (t * (6 * t - 15) + 10);
  
  const x2 = absX * absX;
  const polyVal = x2 * absX * (0.16666666666666666 + 
                  (-0.015721374275200) * x2 + 
                  0.002144118674013 * x2 * x2 + 
                  (-0.000226532477518) * x2 * x2 * x2 + 
                  0.000015206257921 * x2 * x2 * x2 * x2 + 
                  (-0.000000563415316) * x2 * x2 * x2 * x2 * x2 + 
                  0.000000008714110 * x2 * x2 * x2 * x2 * x2 * x2);
                  
  const asympVal = 0.5 * absX * absX - 0.6931471805599453 * absX + 0.4112335167120563;
  
  return sign * ((1 - w) * polyVal + w * asympVal);
}

// Medir derivadas por diferenças finitas centrais de alta precisão
const h = 1e-5;
console.log("x      | F2(x)      | F1(x) (1ª Deriv) | f(x) (2ª Deriv)");
console.log("---------------------------------------------------------");
for (let x = 2.95; x <= 4.05; x += 0.01) {
  const y = F2(x);
  // Diferenças finitas para 1ª derivada (F1)
  const dy = (F2(x + h) - F2(x - h)) / (2 * h);
  // Diferenças finitas para 2ª derivada (f)
  const ddy = (F2(x + h) - 2 * F2(x) + F2(x - h)) / (h * h);
  
  // Imprimir perto das fronteiras 3.0 e 4.0
  if (Math.abs(x - 3.0) < 0.031 || Math.abs(x - 4.0) < 0.031) {
    console.log(`${x.toFixed(4)} | ${y.toFixed(8)} | ${dy.toFixed(8)} | ${ddy.toFixed(8)}`);
  }
}
