import re

with open('src/pages/RealEstate.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the literal '\\n' with actual newlines
text = text.replace('\\n', '\n')

# And replace `}\\n}} />\\n</label>\\n</div>\\n</div>\\n</div>\\n);\\ndefault: return null;`
# with the proper ending
# Since the \n is now fixed:
bad_string = "                  }\n}} />\n</label>\n</div>\n</div>\n</div>\n);\ndefault: return null;"
good_string = """                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>
    );
  default: return null;"""

text = text.replace(bad_string, good_string)

# Actually, the file just has literal "\n", so fixing literal "\n" makes it:
# "                  }\n                }}\n              />\n            </label>\n          </div>\n        </div>\n        </div>\n        );\n      default: return null;"
# Wait, let's just find the literal "}\n                }}\n" and replace it
text = text.replace('                  }\\n                }}\\n              />\\n            </label>\\n          </div>\\n        </div>\\n        </div>\\n        );\\n      default: return null;', good_string)

# If my node replace was executed, the string is:
text = text.replace('                  }\\n}} />\\n</label>\\n</div>\\n</div>\\n</div>\\n);\\ndefault: return null;', good_string)

# We need one more </div>!
# The tree is:
# <div className="flex flex-col h-full gap-3">
#   <div className="grid...">...</div>
#   <div className="flex flex-col flex-1 min-h-[180px]...">
#      <div className="..."> ...
#          <label> ... <input /> </label>
#      </div>
#      <div className="flex-1 overflow-auto..."> table </div>
#   </div>
# </div>

# The user lost the `table` inside `flex-1 overflow-auto` but that's ok.
good_string_with_4 = """                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>
    );
  default: return null;"""
# Let's ensure we close:
# 1. <label>
# 2. <div flex justify-between>
# 3. <div flex flex-col flex-1 min-h>
# 4. <div flex flex-col h-full gap-3>
# So 3 divs.

with open('src/pages/RealEstate.jsx', 'w', encoding='utf-8') as f:
    f.write(text)
