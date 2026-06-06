import re

def repair():
    with open('src/pages/RealEstate.jsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # The file has a duplication. We need to find the REAL start of renderTabContent.
    # The file starts normally up to line 882
    # Then I injected a lot of garbage.
    # Let's find the first "<div className=\"flex items-center space-x-1\">" inside Datos.
    # And then we find the last occurrence of that, which contains the correct code.
    
    # We will split the file into chunks using regular expressions.
    # First, let's just find the very last occurrence of `const renderTabContent = () => {`
    parts = content.split('const renderTabContent = () => {')
    if len(parts) < 2:
        print("Could not find renderTabContent")
        return
        
    before_render = parts[0]
    # The valid renderTabContent is the last one in the file because the inject was BEFORE it.
    valid_render = 'const renderTabContent = () => {' + parts[-1]
    
    # But wait, in `before_render`, there is garbage at the end!
    # The garbage starts at the first occurrence of:
    # <div className="flex items-center space-x-1">
    # followed by the first Exportar button.
    # Let's split before_render at the first occurrence of `<span className="text-[11px] italic font-bold text-[#000080] uppercase tracking-wide">\n                  Documentación del Activo\n                </span>`
    
    marker = 'Documentación del Activo'
    before_parts = before_render.split(marker)
    
    clean_before = before_parts[0] + marker + '\n                </span>\n                <div className="flex items-center space-x-1">\n'
    
    # Now we need to extract from valid_render ONLY the part starting from the Exportar button for Datos.
    # Actually, valid_render IS perfectly valid! Because it's the original code that was pushed down.
    # Wait, valid_render has the complete switch statement including the Datos tab.
    # Let's look at valid_render's Datos tab.
    # We can just stitch clean_before (which goes up to `Documentación del Activo`) with the corresponding part in valid_render?
    # NO! If valid_render has the FULL renderTabContent, we don't need clean_before to go up to `Documentación del Activo`.
    # We just use the original `before_render` up to where the garbage was injected!
    # Where was the garbage injected? 
    # The first injection happened at `StartLine: 886`.
    
    # Let's just output the original file structure:
    # 1. Imports and component start
    # 2. state declarations
    # 3. useEffects
    # 4. calculateTotals
    # 5. tabs array
    # 6. renderTabContent
    # 7. main return
    
    # Wait, the valid_render has EVERYTHING after `const renderTabContent`.
    # What about before `renderTabContent`? 
    # We can just take the first occurrence of everything up to `const renderTabContent`
    # Let's check `parts[0]`. It contains the start of the file, then garbage, then `const tabs = ...` then `const renderTabContent`.
    
    # Let's just remove the garbage from parts[0].
    # The garbage is the second occurrence of `fetchAccounts`, `calculateTotals`, etc.
    # Let's find the FIRST occurrence of `const tabs = [`
    tabs_split = parts[0].split('const tabs = [')
    
    # The real `tabs` declaration should be the FIRST one if there's garbage, or the LAST one?
    # The injection happened at line 886, which is inside `renderTabContent`.
    # This means the FIRST `const tabs = [` is the ORIGINAL one!
    # And the injected garbage contains another `const tabs = [`!
    # So `clean_before` is just the file from the start up to the FIRST `const tabs = [`, and then we add `const tabs = [` and the first `tabs` array.
    
    # Let's just read the file and find the first `const renderTabContent` and see if there's garbage before it.
    # No, the garbage was injected INSIDE `renderTabContent`. So the first `const renderTabContent` is the ORIGINAL one, but its body contains the garbage!
    # So:
    # part 1: from start of file up to `const renderTabContent = () => {\n    switch (activeTab) {\n      case 'Datos':`
    # part 2: the VALID body of `renderTabContent`. We know the valid body is pushed down!
    # It starts at the LAST occurrence of `case 'Datos':`
    
    # Let's try this:
    out = ""
    out += content[:content.find("case 'Datos':")]
    
    last_datos = content.rfind("case 'Datos':")
    out += content[last_datos:]
    
    with open('src/pages/RealEstate.jsx', 'w', encoding='utf-8') as f:
        f.write(out)

    print("Repaired!")

repair()
