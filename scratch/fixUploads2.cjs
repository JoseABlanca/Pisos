const fs = require('fs');
const file = 'src/pages/RealEstate.jsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  {
    find: `onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                          const newDocs = [...formData.mortgageDocs];
                                          const file = e.target.files[0];
                                          newDocs[idx].doc = file.name;
                                          newDocs[idx].docUrl = URL.createObjectURL(file);
                                          newDocs[idx].size = (file.size / 1024).toFixed(0) + ' KB';
                                          setFormData({...formData, mortgageDocs: newDocs});
                                        }
                                      }}`,
    replace: `onChange={async (e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                          if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                          setIsUploading(true);
                                          try {
                                            const file = e.target.files[0];
                                            const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'mortgageDocs');
                                            const newDocs = [...formData.mortgageDocs];
                                            newDocs[idx].doc = file.name;
                                            newDocs[idx].docUrl = url;
                                            newDocs[idx].size = (file.size / 1024).toFixed(0) + ' KB';
                                            setFormData({...formData, mortgageDocs: newDocs});
                                          } finally { setIsUploading(false); }
                                        }
                                      }}`
  },
  {
    find: `onChange={(e) => {
                                          if (e.target.files && e.target.files.length > 0) {
                                            const newRcpt = [...formData.mortgageReceipts];
                                            const file = e.target.files[0];
                                            newRcpt[idx].doc = file.name;
                                            newRcpt[idx].docUrl = URL.createObjectURL(file);
                                            newRcpt[idx].size = (file.size / 1024).toFixed(0) + ' KB';
                                            setFormData({...formData, mortgageReceipts: newRcpt});
                                          }
                                        }}`,
    replace: `onChange={async (e) => {
                                          if (e.target.files && e.target.files.length > 0) {
                                            if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                            setIsUploading(true);
                                            try {
                                              const file = e.target.files[0];
                                              const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'mortgageReceipts');
                                              const newRcpt = [...formData.mortgageReceipts];
                                              newRcpt[idx].doc = file.name;
                                              newRcpt[idx].docUrl = url;
                                              newRcpt[idx].size = (file.size / 1024).toFixed(0) + ' KB';
                                              setFormData({...formData, mortgageReceipts: newRcpt});
                                            } finally { setIsUploading(false); }
                                          }
                                        }}`
  },
  {
    find: `onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                      const newSrvs = [...formData.services];
                                      const file = e.target.files[0];
                                      newSrvs[srv.originalIndex].doc = file.name;
                                      newSrvs[srv.originalIndex].docUrl = URL.createObjectURL(file);
                                      setFormData({...formData, services: newSrvs});
                                    }
                                  }}`,
    replace: `onChange={async (e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                      if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                      setIsUploading(true);
                                      try {
                                        const file = e.target.files[0];
                                        const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'services');
                                        const newSrvs = [...formData.services];
                                        newSrvs[srv.originalIndex].doc = file.name;
                                        newSrvs[srv.originalIndex].docUrl = url;
                                        setFormData({...formData, services: newSrvs});
                                      } finally { setIsUploading(false); }
                                    }
                                  }}`
  },
  {
    find: `onChange={(e) => {
                        const files = Array.from(e.target.files);
                        if (files.length > 0) {
                          const newSrvs = [...formData.services];
                          const newInvs = files.map(file => ({
                            doc: file.name,
                            date: new Date().toISOString().split('T')[0],
                            amount: '',
                            docUrl: URL.createObjectURL(file)
                          }));
                          newSrvs[selectedServiceIndex].invoices = [...(newSrvs[selectedServiceIndex].invoices || []), ...newInvs];
                          setFormData({...formData, services: newSrvs});
                        }
                      }}`,
    replace: `onChange={async (e) => {
                        const files = Array.from(e.target.files);
                        if (files.length > 0) {
                          if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                          setIsUploading(true);
                          try {
                            const newSrvs = [...formData.services];
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
                            setFormData({...formData, services: newSrvs});
                          } finally { setIsUploading(false); }
                        }
                      }}`
  },
  {
    find: `onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                          const newSrvs = [...formData.services];
                                          const file = e.target.files[0];
                                          newSrvs[selectedServiceIndex].invoices[idx].doc = file.name;
                                          newSrvs[selectedServiceIndex].invoices[idx].docUrl = URL.createObjectURL(file);
                                          setFormData({...formData, services: newSrvs});
                                        }
                                      }}`,
    replace: `onChange={async (e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                          if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                          setIsUploading(true);
                                          try {
                                            const file = e.target.files[0];
                                            const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'serviceInvoices');
                                            const newSrvs = [...formData.services];
                                            newSrvs[selectedServiceIndex].invoices[idx].doc = file.name;
                                            newSrvs[selectedServiceIndex].invoices[idx].docUrl = url;
                                            setFormData({...formData, services: newSrvs});
                                          } finally { setIsUploading(false); }
                                        }
                                      }}`
  },
  {
    find: `onChange={(e) => {
                            const files = Array.from(e.target.files);
                            if (files.length > 0) {
                              const newDocs = files.map(file => ({
                                name: file.name,
                                date: new Date().toISOString().split('T')[0],
                                url: URL.createObjectURL(file)
                              }));
                              setFormData({
                                ...formData,
                                community: {
                                  ...formData.community,
                                  paymentDocs: [...(formData.community.paymentDocs || []), ...newDocs]
                                }
                              });
                            }
                          }}`,
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
  {
    find: `onDrop={(e) => {
                          e.preventDefault();
                          setDragOverZone(null);
                          const files = Array.from(e.dataTransfer.files);
                          if (files.length > 0) {
                            const newDocs = files.map(file => ({
                              name: file.name,
                              date: new Date().toISOString().split('T')[0],
                              url: URL.createObjectURL(file)
                            }));
                            setFormData({
                              ...formData,
                              community: {
                                ...formData.community,
                                paymentDocs: [...(formData.community.paymentDocs || []), ...newDocs]
                              }
                            });
                          }
                        }}`,
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
  {
    find: `onChange={(e) => {
                            const files = Array.from(e.target.files);
                            if (files.length > 0) {
                              const newDocs = files.map(file => ({
                                name: file.name,
                                date: new Date().toISOString().split('T')[0],
                                url: URL.createObjectURL(file)
                              }));
                              setFormData({
                                ...formData,
                                community: {
                                  ...formData.community,
                                  meetings: [...(formData.community.meetings || []), ...newDocs]
                                }
                              });
                            }
                          }}`,
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
  {
    find: `onDrop={(e) => {
                          e.preventDefault();
                          setDragOverZone(null);
                          const files = Array.from(e.dataTransfer.files);
                          if (files.length > 0) {
                            const newDocs = files.map(file => ({
                              name: file.name,
                              date: new Date().toISOString().split('T')[0],
                              url: URL.createObjectURL(file)
                            }));
                            setFormData({
                              ...formData,
                              community: {
                                ...formData.community,
                                meetings: [...(formData.community.meetings || []), ...newDocs]
                              }
                            });
                          }
                        }}`,
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
  {
    find: `onChange={(e) => {
                        const files = Array.from(e.target.files);
                        if (files.length > 0) {
                          const newRefs = [...formData.reforms];
                          const newInvs = files.map(file => ({
                            doc: file.name,
                            date: new Date().toISOString().split('T')[0],
                            amount: '',
                            docUrl: URL.createObjectURL(file)
                          }));
                          newRefs[selectedReformIndex].invoices = [...(newRefs[selectedReformIndex].invoices || []), ...newInvs];
                          setFormData({...formData, reforms: newRefs});
                        }
                      }}`,
    replace: `onChange={async (e) => {
                        const files = Array.from(e.target.files);
                        if (files.length > 0) {
                          if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                          setIsUploading(true);
                          try {
                            const newRefs = [...formData.reforms];
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
                            setFormData({...formData, reforms: newRefs});
                          } finally { setIsUploading(false); }
                        }
                      }}`
  },
  {
    find: `onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                          const newRefs = [...formData.reforms];
                                          const file = e.target.files[0];
                                          newRefs[selectedReformIndex].invoices[invIdx].doc = file.name;
                                          newRefs[selectedReformIndex].invoices[invIdx].docUrl = URL.createObjectURL(file);
                                          setFormData({...formData, reforms: newRefs});
                                        }
                                      }}`,
    replace: `onChange={async (e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                          if (!formData.id) { alert("Guarde la propiedad primero."); return; }
                                          setIsUploading(true);
                                          try {
                                            const file = e.target.files[0];
                                            const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'reforms');
                                            const newRefs = [...formData.reforms];
                                            newRefs[selectedReformIndex].invoices[invIdx].doc = file.name;
                                            newRefs[selectedReformIndex].invoices[invIdx].docUrl = url;
                                            setFormData({...formData, reforms: newRefs});
                                          } finally { setIsUploading(false); }
                                        }
                                      }}`
  }
];

let count = 0;
for (const r of replacements) {
  // Try precise match without leading/trailing whitespace variations by stripping spaces and comparing?
  // It's easier to just do it literal if the code hasn't changed.
  if (content.includes(r.find)) {
    content = content.replace(r.find, r.replace);
    count++;
  } else {
    console.log("Could not find:", r.find.substring(0, 50));
  }
}
console.log("Replaced:", count, "/", replacements.length);
fs.writeFileSync(file, content, 'utf8');
