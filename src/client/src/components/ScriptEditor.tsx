import React from 'react';
import {
  Box,
  Typography,
  Paper,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  scriptType: 'node' | 'python' | 'shell' | 'dotnet';
  placeholder?: string;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({
  value,
  onChange,
  scriptType,
  placeholder,
}) => {
  const theme = useTheme();

  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    
    switch (scriptType) {
      case 'node':
        return `// Node.js script
console.log('Hello from cron job!');
console.log('Current time:', new Date().toISOString());

// Access environment variables
console.log('Environment:', process.env.NODE_ENV);

// Exit with success code
process.exit(0);`;
      
      case 'python':
        return `# Python script
import sys
from datetime import datetime

print('Hello from cron job!')
print(f'Current time: {datetime.now().isoformat()}')

# Access command line arguments
print(f'Arguments: {sys.argv[1:]}')

# Exit with success code
sys.exit(0)`;
      
      case 'shell':
        return `#!/bin/bash
# Shell script

echo "Hello from cron job!"
echo "Current time: $(date -Iseconds)"
echo "Current user: $(whoami)"
echo "Working directory: $(pwd)"

# Exit with success code
exit 0`;
      
      case 'dotnet':
        return `// C# script
using System;

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine("Hello from cron job!");
        Console.WriteLine($"Current time: {DateTime.Now}");
        
        // Access command line arguments
        Console.WriteLine($"Arguments: {string.Join(", ", args)}");
        
        Environment.Exit(0);
    }
}`;
      
      default:
        return 'Write your script here...';
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Inline Script
      </Typography>
      <Paper
        sx={{
          p: 0,
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
        }}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getPlaceholder()}
          style={{
            width: '100%',
            minHeight: '300px',
            padding: '12px',
            fontFamily: "'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: '13px',
            lineHeight: '1.6',
            backgroundColor: 'transparent',
            color: theme.palette.text.primary,
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            whiteSpace: 'pre',
            overflowWrap: 'normal',
            overflowX: 'auto',
          }}
          spellCheck={false}
        />
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Tip: Use console.log/print/echo for output. Scripts should exit when complete.
      </Typography>
    </Box>
  );
};

export default ScriptEditor;
