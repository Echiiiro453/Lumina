import os
import re

# Patch ConverterModal
conv_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\ConverterModal.jsx"
with open(conv_path, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    "const [status, setStatus] = useState(null); // 'success', 'error', null\n  const [message, setMessage] = useState('');",
    "const [status, setStatus] = useState(null);\n  const [message, setMessage] = useState('');\n  const [outputPath, setOutputPath] = useState(null);"
)

c = c.replace(
    "setStatus(null);\n    setMessage('');\n\n    try {",
    "setStatus(null);\n    setMessage('');\n    setOutputPath(null);\n\n    try {"
)

c = c.replace(
    "        setStatus('success');\n        setMessage(`Salvo em: ${res.data.output_path}`);",
    "        setStatus('success');\n        setMessage(`Conversão concluída com sucesso!`);\n        setOutputPath(res.data.output_path);"
)

c = c.replace(
    "  const handleChooseFile = async () => {",
    """  const handleOpenFile = () => {
    if (outputPath) {
      axios.post(`${apiUrl}/api/open_external`, { file_path: outputPath }).catch(console.error);
    }
  };

  const handleChooseFile = async () => {"""
)

conv_html_patch = """                {status === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium mt-0.5">{message}</p>
                  {status === 'success' && outputPath && (
                    <div className="mt-2 bg-green-500/20 rounded-lg p-2 flex flex-col gap-2 border border-green-500/20">
                      <p className="text-[10px] font-mono break-all opacity-80">{outputPath}</p>
                      <button 
                        onClick={handleOpenFile} 
                        className="flex items-center gap-1.5 self-start bg-green-500/30 hover:bg-green-500/50 text-green-300 transition-colors px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        <FolderOpen size={14} /> Abrir Arquivo
                      </button>
                    </div>
                  )}
                </div>"""

c = re.sub(
    r"\{status === 'success' \? <CheckCircle.*?<p className=\"text-xs break-all mt-0.5\">\{message\}</p>",
    conv_html_patch,
    c,
    flags=re.DOTALL
)

with open(conv_path, "w", encoding="utf-8") as f:
    f.write(c)


# Patch TagEditorModal
tag_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\TagEditorModal.jsx"
with open(tag_path, "r", encoding="utf-8") as f:
    t = f.read()

# TagEditor uses <p className="text-xs break-all mt-0.5">{message}</p> similar to Converter
# Let's find out how TagEditor handles save response
t = t.replace(
    "const [status, setStatus] = useState(null);\n  const [message, setMessage] = useState('');",
    "const [status, setStatus] = useState(null);\n  const [message, setMessage] = useState('');\n  const [outputPath, setOutputPath] = useState(null);"
)

t = t.replace(
    "setStatus(null);\n    setMessage('');\n\n    try {",
    "setStatus(null);\n    setMessage('');\n    setOutputPath(null);\n\n    try {"
)

# Tag Editor success response block
t = t.replace(
    "if (res.data.success) {\n        setStatus('success');\n        setMessage('Metadados salvos com sucesso!');",
    "if (res.data.success) {\n        setStatus('success');\n        setMessage('Metadados salvos com sucesso!');\n        if (res.data.new_path) setOutputPath(res.data.new_path);"
)

t = t.replace(
    "const handleClose = () => {",
    """const handleOpenFile = () => {
    if (outputPath) {
      axios.post(`${apiUrl}/api/open_external`, { file_path: outputPath }).catch(console.error);
    }
  };

  const handleClose = () => {"""
)

tag_html_patch = """                {status === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs mt-0.5 font-medium">{message}</p>
                  {status === 'success' && outputPath && (
                    <div className="mt-2 bg-green-500/20 rounded-lg p-2 flex flex-col gap-2 border border-green-500/20">
                      <p className="text-[10px] font-mono break-all opacity-80">{outputPath}</p>
                      <button 
                        onClick={handleOpenFile} 
                        className="flex items-center gap-1.5 self-start bg-green-500/30 hover:bg-green-500/50 text-green-300 transition-colors px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        <FolderOpen size={14} /> Abrir Arquivo Modificado
                      </button>
                    </div>
                  )}
                </div>"""

t = re.sub(
    r"\{status === 'success' \? <CheckCircle.*?<p className=\"text-xs break-all mt-0.5\">\{message\}</p>",
    tag_html_patch,
    t,
    flags=re.DOTALL
)

with open(tag_path, "w", encoding="utf-8") as f:
    f.write(t)

print("Updated both modals successfully")
