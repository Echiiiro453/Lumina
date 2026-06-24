"""
Global configurations and constants for the Lumina backend.
"""

# Impersonation target for curl_cffi requests to avoid bot detection
CHROME_IMPERSONATE = "chrome120"

# Standard User-Agent for requests that do not use curl_cffi
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Default yt-dlp timeout
DEFAULT_TIMEOUT = 10
