const fs = require('fs');

const file = 'src/pages/RealEstate.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('uploadFileToStorage')) {
  content = content.replace(
    "import { handleExportFormat } from '../utils/exportUtils';",
    "import { handleExportFormat } from '../utils/exportUtils';\nimport { uploadFileToStorage } from '../utils/storageUtils';"
  );
}

// Add isUploading state
if (!content.includes('const [isUploading, setIsUploading]')) {
  content = content.replace(
    "const [showSidebar, setShowSidebar] = useState(true);",
    "const [showSidebar, setShowSidebar] = useState(true);\n  const [isUploading, setIsUploading] = useState(false);"
  );
}

// Replace the inline handlers that contain URL.createObjectURL
// It looks like they are inside:
// 1. (e) => { ... URL.createObjectURL(file) ... }
// Let's use a regex to match the pattern:
// url: URL.createObjectURL(file) OR docUrl: URL.createObjectURL(file)

// We actually need to change the function to async, add the ID check and uploading state, and await uploadFileToStorage.
// It's safer to just replace them one by one or with a clever script. Let's do it manually via regex replacements where we can match the block.

const patterns = [
  // 1. propertyDocs (Lines ~893, ~913)
  {
    find: /onChange=\{\(e\) => \{\s*const files = Array\.from\(e\.target\.files\);\s*if \(files\.length > 0\) \{\s*const newDocs = files\.map\(file => \(\{\s*name: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*concept: '',\s*url: URL\.createObjectURL\(file\)\s*\}\)\);\s*setFormData\(\{ \.\.\.formData, propertyDocs: \[\.\.\.\(formData\.propertyDocs \|\| \[\]\), \.\.\.newDocs\] \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
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
                          } finally { setIsUploading(false); }
                        }
                      }}`
  },
  {
    find: /onDrop=\{\(e\) => \{\s*e\.preventDefault\(\);\s*setDragOverZone\(null\);\s*const files = Array\.from\(e\.dataTransfer\.files\);\s*if \(files\.length > 0\) \{\s*const newDocs = files\.map\(file => \(\{\s*name: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*concept: '',\s*url: URL\.createObjectURL\(file\)\s*\}\)\);\s*setFormData\(\{ \.\.\.formData, propertyDocs: \[\.\.\.\(formData\.propertyDocs \|\| \[\]\), \.\.\.newDocs\] \}\);\s*\}\s*\}\}/g,
    replace: `onDrop={async (e) => {
                  e.preventDefault();
                  setDragOverZone(null);
                  const files = Array.from(e.dataTransfer.files);
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
                    } finally { setIsUploading(false); }
                  }
                }}`
  },
  // 2. mortgageDocs (Line ~1280)
  {
    find: /onChange=\{\(e\) => \{\s*const file = e\.target\.files\[0\];\s*if \(file\) \{\s*const newDocs = \[\.\.\.\(formData\.mortgageDocs \|\| \[\]\)\];\s*newDocs\[idx\]\.doc = file\.name;\s*newDocs\[idx\]\.docUrl = URL\.createObjectURL\(file\);\s*setFormData\(\{ \.\.\.formData, mortgageDocs: newDocs \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                          if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                          setIsUploading(true);
                                          try {
                                            const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'mortgageDocs');
                                            const newDocs = [...(formData.mortgageDocs || [])];
                                            newDocs[idx].doc = file.name;
                                            newDocs[idx].docUrl = url;
                                            setFormData({ ...formData, mortgageDocs: newDocs });
                                          } finally { setIsUploading(false); }
                                        }
                                      }}`
  },
  // 3. mortgageReceipts (Line ~1440)
  {
    find: /onChange=\{\(e\) => \{\s*const file = e\.target\.files\[0\];\s*if \(file\) \{\s*const newRcpt = \[\.\.\.\(formData\.mortgageReceipts \|\| \[\]\)\];\s*newRcpt\[idx\]\.doc = file\.name;\s*newRcpt\[idx\]\.docUrl = URL\.createObjectURL\(file\);\s*setFormData\(\{ \.\.\.formData, mortgageReceipts: newRcpt \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                                          const file = e.target.files[0];
                                          if (file) {
                                            if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                            setIsUploading(true);
                                            try {
                                              const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'mortgageReceipts');
                                              const newRcpt = [...(formData.mortgageReceipts || [])];
                                              newRcpt[idx].doc = file.name;
                                              newRcpt[idx].docUrl = url;
                                              setFormData({ ...formData, mortgageReceipts: newRcpt });
                                            } finally { setIsUploading(false); }
                                          }
                                        }}`
  },
  // 4. services doc (Line ~1709)
  {
    find: /onChange=\{\(e\) => \{\s*const file = e\.target\.files\[0\];\s*if \(file\) \{\s*const newSrvs = \[\.\.\.\(formData\.services \|\| \[\]\)\];\s*newSrvs\[srv\.originalIndex\]\.doc = file\.name;\s*newSrvs\[srv\.originalIndex\]\.docUrl = URL\.createObjectURL\(file\);\s*setFormData\(\{ \.\.\.formData, services: newSrvs \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                                      const file = e.target.files[0];
                                      if (file) {
                                        if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                        setIsUploading(true);
                                        try {
                                          const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'services');
                                          const newSrvs = [...(formData.services || [])];
                                          newSrvs[srv.originalIndex].doc = file.name;
                                          newSrvs[srv.originalIndex].docUrl = url;
                                          setFormData({ ...formData, services: newSrvs });
                                        } finally { setIsUploading(false); }
                                      }
                                    }}`
  },
  // 5. services invoices general upload (Line ~1800)
  {
    find: /onChange=\{\(e\) => \{\s*const files = Array\.from\(e\.target\.files\);\s*if \(files\.length > 0\) \{\s*const newSrvs = \[\.\.\.\(formData\.services \|\| \[\]\)\];\s*const newInvs = files\.map\(file => \(\{\s*doc: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*amount: '',\s*docUrl: URL\.createObjectURL\(file\)\s*\}\)\);\s*newSrvs\[selectedServiceIndex\]\.invoices = \[\.\.\.\(newSrvs\[selectedServiceIndex\]\.invoices \|\| \[\]\), \.\.\.newInvs\];\s*setFormData\(\{ \.\.\.formData, services: newSrvs \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                            const files = Array.from(e.target.files);
                            if (files.length > 0) {
                              if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                              setIsUploading(true);
                              try {
                                const newSrvs = [...(formData.services || [])];
                                const newInvs = [];
                                for (const file of files) {
                                  const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'serviceInvoices');
                                  newInvs.push({
                                    doc: file.name,
                                    date: new Date().toISOString().split('T')[0],
                                    amount: '',
                                    docUrl: url
                                  });
                                }
                                newSrvs[selectedServiceIndex].invoices = [...(newSrvs[selectedServiceIndex].invoices || []), ...newInvs];
                                setFormData({ ...formData, services: newSrvs });
                              } finally { setIsUploading(false); }
                            }
                          }}`
  },
  // 6. services specific invoice doc update (Line ~1861)
  {
    find: /onChange=\{\(e\) => \{\s*const file = e\.target\.files\[0\];\s*if \(file\) \{\s*const newSrvs = \[\.\.\.\(formData\.services \|\| \[\]\)\];\s*newSrvs\[selectedServiceIndex\]\.invoices\[idx\]\.doc = file\.name;\s*newSrvs\[selectedServiceIndex\]\.invoices\[idx\]\.docUrl = URL\.createObjectURL\(file\);\s*setFormData\(\{ \.\.\.formData, services: newSrvs \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                                          const file = e.target.files[0];
                                          if (file) {
                                            if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                            setIsUploading(true);
                                            try {
                                              const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'serviceInvoices');
                                              const newSrvs = [...(formData.services || [])];
                                              newSrvs[selectedServiceIndex].invoices[idx].doc = file.name;
                                              newSrvs[selectedServiceIndex].invoices[idx].docUrl = url;
                                              setFormData({ ...formData, services: newSrvs });
                                            } finally { setIsUploading(false); }
                                          }
                                        }}`
  },
  // 7. community payments onChange (Line ~2090)
  {
    find: /onChange=\{\(e\) => \{\s*const files = Array\.from\(e\.target\.files\);\s*if \(files\.length > 0\) \{\s*const newDocs = files\.map\(file => \(\{\s*name: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*url: URL\.createObjectURL\(file\)\s*\}\)\);\s*setFormData\(\{\s*\.\.\.formData,\s*community: \{\s*\.\.\.formData\.community,\s*paymentDocs: \[\.\.\.\(formData\.community\.paymentDocs \|\| \[\]\), \.\.\.newDocs\]\s*\}\s*\}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                            const files = Array.from(e.target.files);
                            if (files.length > 0) {
                              if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                              setIsUploading(true);
                              try {
                                const newDocs = [];
                                for (const file of files) {
                                  const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'communityPayments');
                                  newDocs.push({
                                    name: file.name,
                                    date: new Date().toISOString().split('T')[0],
                                    url: url
                                  });
                                }
                                setFormData({
                                  ...formData,
                                  community: {
                                    ...formData.community,
                                    paymentDocs: [...(formData.community.paymentDocs || []), ...newDocs]
                                  }
                                });
                              } finally { setIsUploading(false); }
                            }
                          }}`
  },
  // 8. community payments onDrop (Line ~2119)
  {
    find: /onDrop=\{\(e\) => \{\s*e\.preventDefault\(\);\s*setDragOverZone\(null\);\s*const files = Array\.from\(e\.dataTransfer\.files\);\s*if \(files\.length > 0\) \{\s*const newDocs = files\.map\(file => \(\{\s*name: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*url: URL\.createObjectURL\(file\)\s*\}\)\);\s*setFormData\(\{\s*\.\.\.formData,\s*community: \{\s*\.\.\.formData\.community,\s*paymentDocs: \[\.\.\.\(formData\.community\.paymentDocs \|\| \[\]\), \.\.\.newDocs\]\s*\}\s*\}\);\s*\}\s*\}\}/g,
    replace: `onDrop={async (e) => {
                      e.preventDefault();
                      setDragOverZone(null);
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length > 0) {
                        if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                        setIsUploading(true);
                        try {
                          const newDocs = [];
                          for (const file of files) {
                            const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'communityPayments');
                            newDocs.push({
                              name: file.name,
                              date: new Date().toISOString().split('T')[0],
                              url: url
                            });
                          }
                          setFormData({
                            ...formData,
                            community: {
                              ...formData.community,
                              paymentDocs: [...(formData.community.paymentDocs || []), ...newDocs]
                            }
                          });
                        } finally { setIsUploading(false); }
                      }
                    }}`
  },
  // 9. community meetings onChange (Line ~2237)
  {
    find: /onChange=\{\(e\) => \{\s*const files = Array\.from\(e\.target\.files\);\s*if \(files\.length > 0\) \{\s*const newDocs = files\.map\(file => \(\{\s*name: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*url: URL\.createObjectURL\(file\)\s*\}\)\);\s*setFormData\(\{\s*\.\.\.formData,\s*community: \{\s*\.\.\.formData\.community,\s*meetings: \[\.\.\.\(formData\.community\.meetings \|\| \[\]\), \.\.\.newDocs\]\s*\}\s*\}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                            const files = Array.from(e.target.files);
                            if (files.length > 0) {
                              if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                              setIsUploading(true);
                              try {
                                const newDocs = [];
                                for (const file of files) {
                                  const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'communityMeetings');
                                  newDocs.push({
                                    name: file.name,
                                    date: new Date().toISOString().split('T')[0],
                                    url: url
                                  });
                                }
                                setFormData({
                                  ...formData,
                                  community: {
                                    ...formData.community,
                                    meetings: [...(formData.community.meetings || []), ...newDocs]
                                  }
                                });
                              } finally { setIsUploading(false); }
                            }
                          }}`
  },
  // 10. community meetings onDrop (Line ~2265)
  {
    find: /onDrop=\{\(e\) => \{\s*e\.preventDefault\(\);\s*setDragOverZone\(null\);\s*const files = Array\.from\(e\.dataTransfer\.files\);\s*if \(files\.length > 0\) \{\s*const newDocs = files\.map\(file => \(\{\s*name: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*url: URL\.createObjectURL\(file\)\s*\}\)\);\s*setFormData\(\{\s*\.\.\.formData,\s*community: \{\s*\.\.\.formData\.community,\s*meetings: \[\.\.\.\(formData\.community\.meetings \|\| \[\]\), \.\.\.newDocs\]\s*\}\s*\}\);\s*\}\s*\}\}/g,
    replace: `onDrop={async (e) => {
                      e.preventDefault();
                      setDragOverZone(null);
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length > 0) {
                        if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                        setIsUploading(true);
                        try {
                          const newDocs = [];
                          for (const file of files) {
                            const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'communityMeetings');
                            newDocs.push({
                              name: file.name,
                              date: new Date().toISOString().split('T')[0],
                              url: url
                            });
                          }
                          setFormData({
                            ...formData,
                            community: {
                              ...formData.community,
                              meetings: [...(formData.community.meetings || []), ...newDocs]
                            }
                          });
                        } finally { setIsUploading(false); }
                      }
                    }}`
  },
  // 11. reforms invoices upload (Line ~2520)
  {
    find: /onChange=\{\(e\) => \{\s*const files = Array\.from\(e\.target\.files\);\s*if \(files\.length > 0\) \{\s*const newRefs = \[\.\.\.\(formData\.reforms \|\| \[\]\)\];\s*const newInvs = files\.map\(file => \(\{\s*doc: file\.name,\s*date: new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\],\s*amount: '',\s*docUrl: URL\.createObjectURL\(file\)\s*\}\)\);\s*newRefs\[selectedReformIndex\]\.invoices = \[\.\.\.\(newRefs\[selectedReformIndex\]\.invoices \|\| \[\]\), \.\.\.newInvs\];\s*setFormData\(\{ \.\.\.formData, reforms: newRefs \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                            const files = Array.from(e.target.files);
                            if (files.length > 0) {
                              if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                              setIsUploading(true);
                              try {
                                const newRefs = [...(formData.reforms || [])];
                                const newInvs = [];
                                for (const file of files) {
                                  const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'reforms');
                                  newInvs.push({
                                    doc: file.name,
                                    date: new Date().toISOString().split('T')[0],
                                    amount: '',
                                    docUrl: url
                                  });
                                }
                                newRefs[selectedReformIndex].invoices = [...(newRefs[selectedReformIndex].invoices || []), ...newInvs];
                                setFormData({ ...formData, reforms: newRefs });
                              } finally { setIsUploading(false); }
                            }
                          }}`
  },
  // 12. reforms invoices specific file update (Line ~2580)
  {
    find: /onChange=\{\(e\) => \{\s*const file = e\.target\.files\[0\];\s*if \(file\) \{\s*const newRefs = \[\.\.\.\(formData\.reforms \|\| \[\]\)\];\s*newRefs\[selectedReformIndex\]\.invoices\[invIdx\]\.doc = file\.name;\s*newRefs\[selectedReformIndex\]\.invoices\[invIdx\]\.docUrl = URL\.createObjectURL\(file\);\s*setFormData\(\{ \.\.\.formData, reforms: newRefs \}\);\s*\}\s*\}\}/g,
    replace: `onChange={async (e) => {
                                          const file = e.target.files[0];
                                          if (file) {
                                            if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                            setIsUploading(true);
                                            try {
                                              const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'reforms');
                                              const newRefs = [...(formData.reforms || [])];
                                              newRefs[selectedReformIndex].invoices[invIdx].doc = file.name;
                                              newRefs[selectedReformIndex].invoices[invIdx].docUrl = url;
                                              setFormData({ ...formData, reforms: newRefs });
                                            } finally { setIsUploading(false); }
                                          }
                                        }}`
  }
];

let replaced = 0;
patterns.forEach((p, index) => {
  if (p.find.test(content)) {
    content = content.replace(p.find, p.replace);
    replaced++;
  } else {
    console.log("Pattern not found: " + index);
  }
});

console.log("Replaced patterns:", replaced, "/", patterns.length);

fs.writeFileSync(file, content, 'utf8');
