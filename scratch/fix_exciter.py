import re

file_path = 'e:/youtubr/youtubeMusicDownload-main/frontend/src/components/PlayerBar.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update amountMap for softer curves
old_amount = "const amountMap = { off: 0, subtle: 2, medium: 6, strong: 14 };"
new_amount = "const amountMap = { off: 0, subtle: 0.5, medium: 1.5, strong: 3.0 };"
code = code.replace(old_amount, new_amount)

# 2. Update the architecture of the Exciter
# We need to find:
old_exciter_init = """      // 3. Harmonic Exciter (WaveShaper soft saturation)
      const exciter = audioCtx.createWaveShaper();
      exciter.oversample = '4x';
      const amountMap = { off: 0, subtle: 2, medium: 6, strong: 14 };
      exciter.curve = makeExciterCurve(amountMap[harmonicExciter] ?? 0);
      exciterNodeRef.current = exciter;"""

new_exciter_init = """      // 3. Harmonic Exciter (High-Pass Parallel Saturation)
      const exciterSplit = audioCtx.createGain(); // Dry signal
      const exciterHighpass = audioCtx.createBiquadFilter();
      exciterHighpass.type = 'highpass'; 
      exciterHighpass.frequency.value = 2500; // Only saturate above 2.5kHz
      
      const exciter = audioCtx.createWaveShaper();
      exciter.oversample = '4x';
      const amountMap = { off: 0, subtle: 0.5, medium: 1.5, strong: 3.0 };
      exciter.curve = makeExciterCurve(amountMap[harmonicExciter] ?? 0);
      exciterNodeRef.current = exciter;
      
      const exciterMerge = audioCtx.createGain();
      
      // Routing
      exciterSplit.connect(exciterMerge); // Dry path
      exciterSplit.connect(exciterHighpass); // Wet path
      exciterHighpass.connect(exciter);
      exciter.connect(exciterMerge);"""

code = code.replace(old_exciter_init, new_exciter_init)

# 3. Update the signal chain
old_chain = """      // === CONNECT FULL CHAIN ===
      // source -> EQ -> cfSplit -> cfMerge -> bassMerge -> exciter -> wSplit -> wMerge
      source.connect(filters[0]);
      filters[filters.length - 1].connect(cfSplit);
      cfMerge.connect(bassSplit);
      bassMerge.connect(exciter);
      exciter.connect(wSplit);"""

new_chain = """      // === CONNECT FULL CHAIN ===
      // source -> EQ -> cfSplit -> cfMerge -> bassMerge -> exciterSplit -> exciterMerge -> wSplit -> wMerge
      source.connect(filters[0]);
      filters[filters.length - 1].connect(cfSplit);
      cfMerge.connect(bassSplit);
      bassMerge.connect(exciterSplit);
      exciterMerge.connect(wSplit);"""

code = code.replace(old_chain, new_chain)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Exciter Fixed.")
