const fs = require('fs');
let txt = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');
const lines = txt.split('\n');

let start = -1;
let end = -1;
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes("if (rvChartTypes.includes('evolucion')) {")) {
    start = i;
  }
  if (start > -1 && i > start + 20 && lines[i].includes(');') && lines[i+1] && lines[i+1].includes('}')) {
    if (lines[i-1].includes('</div>')) {
      end = i + 1;
      break;
    }
  }
}

if (start > -1 && end > -1) {
  lines.splice(start, end - start + 1);
  // Also remove the "}" that precedes the if (in "} if (rvChartTypes...")
  // We can just leave the "}" on the previous line and remove the whole "if" block.
  // Wait, the start line is `      } if (rvChartTypes.includes('evolucion')) {`
  // We should just keep the `      }` part.
  const oldStartLine = lines[start - 1]; // Because we spliced, it's now start-1 ? No, start was removed.
  // Actually, we can just replace the string explicitly.
}

// Let's do string replacement instead!
const target = "      } if (rvChartTypes.includes('evolucion')) {";
const startIdx = txt.indexOf(target);
if (startIdx > -1) {
  const substr = txt.substring(startIdx);
  const endMarker = "          </div>\n        );\n      }";
  const endIdx = substr.indexOf(endMarker) + endMarker.length;
  if (endIdx > endMarker.length) {
    const blockToRemove = substr.substring(0, endIdx);
    // Wait, the end of the block is:
    //         </div>
    //       );
    //     }
    const finalTxt = txt.replace(blockToRemove, "      }");
    fs.writeFileSync('src/pages/PrintPage.jsx', finalTxt, 'utf8');
    console.log("Chart removed successfully!");
  }
}
