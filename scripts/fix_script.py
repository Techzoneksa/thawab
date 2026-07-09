import re

with open(r'D:\thawab\scripts\deploy-hostinger.sh', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace corrupted emoji lines with clean ASCII alternatives
content = re.sub(
    r'ok\(\).*?echo -e.*?\$1"; \}',
    'ok()   { echo -e "  \\033[1;32m[OK]\\033[0m $1"; }',
    content
)
content = re.sub(
    r'warn\(\).*?echo -e.*?\$1"; \}',
    'warn() { echo -e "  \\033[1;33m[!!]\\033[0m $1"; }',
    content
)
content = re.sub(
    r'fail\(\).*?echo -e.*?\$1"; \}',
    'fail() { echo -e "  \\033[1;31m[XX]\\033[0m $1"; }',
    content
)

# Replace any remaining corruption chars
content = content.replace('\uFFFD', '')

with open(r'D:\thawab\scripts\deploy-hostinger.sh', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed!")
