from pathlib import Path
import re
text = Path('composio_docs.html').read_text()
urls = re.findall(r'https://[^"\s]+/api/[^"\s]+', text)
for url in urls[:50]:
    print(url)
