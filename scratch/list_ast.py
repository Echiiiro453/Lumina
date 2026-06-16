import ast

with open("backend/main.py", "r", encoding="utf-8") as f:
    source = f.read()

tree = ast.parse(source)

for node in tree.body:
    if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
        print(f"Function: {node.name} (Lines {node.lineno}-{node.end_lineno})")
    elif isinstance(node, ast.ClassDef):
        print(f"Class: {node.name} (Lines {node.lineno}-{node.end_lineno})")
