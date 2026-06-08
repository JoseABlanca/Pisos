import json

log_path = r"C:\Users\Jose\.gemini\antigravity\brain\aee6c8fe-66e7-489b-8737-72aa3536764f\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'Rentals.jsx' in line and 'write_to_file' in line:
            try:
                data = json.loads(line)
                if data.get('type') == 'PLANNER_RESPONSE':
                    tool_calls = data.get('tool_calls', [])
                    for tc in tool_calls:
                        if tc.get('name') == 'write_to_file':
                            args = tc.get('args', {})
                            if 'Rentals.jsx' in args.get('TargetFile', ''):
                                print(f"Found write_to_file at step {data.get('step_index')}")
                                with open(f"Rentals_recovered_step_{data.get('step_index')}.jsx", "w", encoding="utf-8") as out:
                                    out.write(args.get('CodeContent', ''))
            except:
                pass
