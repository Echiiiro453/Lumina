import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('API_KEY = "b25b959554ed76058ac220b7b2e0a026"', 'API_KEY = "45abac6172ea06f1115f89a7ee4dd76c"')
content = content.replace('API_SECRET = "425b55975eedaf59ebcebdbe148ec411"', 'API_SECRET = "6025770414ec2518c1c694ddc27e57e6"')

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
