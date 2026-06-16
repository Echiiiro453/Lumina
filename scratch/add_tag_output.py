import os

filepath = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\TagEditorModal.jsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add outputPath state
content = content.replace("const [status, setStatus] = useState(null);", "const [status, setStatus] = useState(null);\n  const [outputPath, setOutputPath] = useState(null);")

# 2. Update handleSave to set outputPath
save_old = """          if (res.data.new_path) {
            song.file_path = res.data.new_path;
          }"""
save_new = """          if (res.data.new_path) {
            song.file_path = res.data.new_path;
            setOutputPath(res.data.new_path);
          } else {
            setOutputPath(song.file_path);
          }"""
content = content.replace(save_old, save_new)

# 3. Add handleOpenExternal
open_ext = """  const handleOpenExternal = async () => {
    if (!outputPath) return;
    try {
      await axios.post(getApiUrl(`/api/open_external`), { file_path: outputPath });
    } catch(e) { console.error(e); }
  };
"""
content = content.replace("const handleSave = async () => {", open_ext + "\n  const handleSave = async () => {")

# 4. Add UI for outputPath
ui_old = """        {status && (
          <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 border ${status.type === 'success' ? 'bg-success/10 border-success/20 text-success' : 'bg-error/10 border-error/20 text-error'}`}>
            {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <p className="font-medium">{status.msg}</p>
          </div>
        )}"""
ui_new = """        {status && (
          <div className={`mt-6 p-4 rounded-xl flex items-center justify-between border ${status.type === 'success' ? 'bg-success/10 border-success/20 text-success' : 'bg-error/10 border-error/20 text-error'}`}>
            <div className="flex items-center gap-3">
               {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
               <p className="font-medium">{status.msg}</p>
            </div>
            {status.type === 'success' && outputPath && (
               <button onClick={handleOpenExternal} className="px-4 py-2 bg-success/20 hover:bg-success/30 rounded-lg text-sm font-bold transition-colors">
                 Abrir Local do Arquivo
               </button>
            )}
          </div>
        )}"""
content = content.replace(ui_old, ui_new)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

# Update ConverterModal.jsx to rename "Abrir Arquivo" to "Abrir Local do Arquivo"
conv_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\ConverterModal.jsx"
with open(conv_path, "r", encoding="utf-8") as f:
    conv_content = f.read()

conv_content = conv_content.replace(">Abrir Arquivo<", ">Abrir Local do Arquivo<")
with open(conv_path, "w", encoding="utf-8") as f:
    f.write(conv_content)

print("Added outputPath to TagEditor and updated buttons.")
