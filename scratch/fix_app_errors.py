import re

with open('frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix for main download job error
content = content.replace(
    "setMessage(job.error || t('statusError'));",
    """let errMsg = job.error || t('statusError');
          if (!isAuthenticated) {
            errMsg += "\\n\\n⚠️ Dica: Você está sem login (cookies.txt). Vá nas configurações, adicione seus cookies e tente novamente! O YouTube bloqueia downloads sem login.";
          }
          setMessage(errMsg);"""
)

# Fix for background queue error
content = content.replace(
    "updateQueueItem(item.uniqueId, { status: 'error', error: statusData.error });",
    """let queueErrMsg = statusData.error || 'Erro';
              if (!isAuthenticated) {
                  queueErrMsg += ' (Dica: Adicione seus cookies.txt nas configurações!)';
              }
              updateQueueItem(item.uniqueId, { status: 'error', error: queueErrMsg });"""
)

with open('frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
