import React from 'react';
import { useTranslation } from 'react-i18next';

// @group Types : ScriptEditor props
interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  scriptType: 'node' | 'python' | 'shell' | 'dotnet';
  placeholder?: string;
}

// @group Helpers : Default placeholder per script type
const getDefaultPlaceholder = (scriptType: ScriptEditorProps['scriptType']): string => {
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

// @group ScriptEditor : CLI-styled code editor textarea
const ScriptEditor: React.FC<ScriptEditorProps> = ({
  value,
  onChange,
  scriptType,
  placeholder,
}) => {
  const { t } = useTranslation();

  const resolvedPlaceholder = placeholder ?? getDefaultPlaceholder(scriptType);

  // @group Render : Hardcoded dark CLI aesthetic — no dark: variants
  return (
    <div>
      {/* @group Toolbar : Label row */}
      <div className="mb-1 font-mono text-[10px] font-semibold text-[#888] uppercase tracking-widest">
        {t('scriptEditor.title')}
      </div>

      {/* @group EditorContainer : Dark bordered panel */}
      <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-sm overflow-hidden">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={resolvedPlaceholder}
          spellCheck={false}
          className="w-full font-mono text-[10px] leading-relaxed text-[#e8e8e8]
                     bg-[#0a0a0a] placeholder-[#333] border-none outline-none
                     resize-y p-3 min-h-[300px] whitespace-pre overflow-x-auto"
          style={{ overflowWrap: 'normal' }}
        />
      </div>

      {/* @group Footer : Tip text */}
      <div className="mt-1 font-mono text-[10px] text-[#555]">
        {t('scriptEditor.tip')}
      </div>
    </div>
  );
};

export default ScriptEditor;
