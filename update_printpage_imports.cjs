const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

content = content.replace(
  "import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';",
  "import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line } from 'recharts';"
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Updated imports');
