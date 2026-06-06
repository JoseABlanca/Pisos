import re

with open('src/pages/RealEstate.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Find `const renderTabContent = () => {`
start_idx = text.find('const renderTabContent = () => {')

# Find the end of it. The end is just before `return (` of the main component.
end_idx = text.find('  return (\n    <div className="w-full h-full')

if start_idx == -1 or end_idx == -1:
    print("Could not find start or end")
    exit()

dummy_render = """  const renderTabContent = () => {
    return (
      <div className="flex flex-col h-full gap-3 p-4 bg-white">
        <h2 className="text-xl font-bold mb-4">Datos (Recuperación)</h2>
        <div className="flex items-center space-x-2">
          <label className="btn-classic px-4 py-2 bg-blue-100 hover:bg-blue-200 cursor-pointer rounded border border-blue-300">
            Adjuntar Pago (Persistente)
            <input
              type="file"
              className="hidden"
              multiple
              onChange={async (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                  if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                  setIsUploading(true);
                  try {
                    const newDocs = [];
                    for (const file of files) {
                      const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'propertyDocs');
                      newDocs.push({
                        name: file.name,
                        date: new Date().toISOString().split('T')[0],
                        concept: '',
                        url: url
                      });
                    }
                    setFormData({ ...formData, propertyDocs: [...(formData.propertyDocs || []), ...newDocs] });
                  } catch(err) {
                    console.error(err);
                  } finally { 
                    setIsUploading(false); 
                  }
                }
              }}
            />
          </label>
        </div>
        <div className="mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="border-b p-2">Documento</th>
                <th className="border-b p-2">Fecha</th>
                <th className="border-b p-2">Enlace</th>
              </tr>
            </thead>
            <tbody>
              {(formData.propertyDocs || []).map((doc, i) => (
                <tr key={i}>
                  <td className="border-b p-2">{doc.name}</td>
                  <td className="border-b p-2">{doc.date}</td>
                  <td className="border-b p-2">
                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-blue-500 underline">Ver</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

"""

new_text = text[:start_idx] + dummy_render + text[end_idx:]

with open('src/pages/RealEstate.jsx', 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Done")
