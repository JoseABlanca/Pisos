import json

log_path = r"C:\Users\Jose\.gemini\antigravity\brain\aee6c8fe-66e7-489b-8737-72aa3536764f\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    with open("recovered_rentals.txt", "w", encoding="utf-8") as out:
        for line in f:
            if 'Rentals.jsx' in line and ('"type":"SYSTEM"' or '"source":"SYSTEM"' in line):
                try:
                    data = json.loads(line)
                    # Dump the whole object
                    out.write(json.dumps(data, indent=2) + "\n\n=====\n\n")
                except:
                    pass
