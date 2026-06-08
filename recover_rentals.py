import json

log_path = r"C:\Users\Jose\.gemini\antigravity\brain\aee6c8fe-66e7-489b-8737-72aa3536764f\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('source') == 'SYSTEM' and data.get('type') == 'PLANNER_RESPONSE_SYSTEM':
                # Tool responses
                if 'Rentals.jsx' in line:
                    output = data.get('content', '')
                    if output.startswith('File Path:'):
                        print("FOUND VIEW FILE")
                        # We just want the largest view file response for Rentals.jsx
                        with open("recovered_rentals.txt", "a", encoding="utf-8") as out:
                            out.write(output + "\n\n=====\n\n")
        except:
            pass
