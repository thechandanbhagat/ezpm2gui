import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProjectConfig {
  name: string;
  detection: {
    files: string[];
    extensions: string[];
  };
  setup: {
    steps: SetupStep[];
    environment: Record<string, string>;
  };
  validation: {
    checks: ValidationCheck[];
  };
  defaultConfig: {
    interpreter: string;
    execMode: 'fork' | 'cluster';
    supportsCluster: boolean;
    interpreterPath?: string;
    startScript?: string;
    startCommand?: string;
  };
}

export interface SetupStep {
  name: string;
  command: string;
  description: string;
  required: boolean;
  conditional?: string;
  platform?: 'win32' | 'unix';
  workingDirectory?: string;
  useVenv?: boolean;
  timeout?: number;
}

export interface ValidationCheck {
  name: string;
  file?: string;
  directory?: string;
  pattern?: string;
  optional?: boolean;
}

export interface SetupResult {
  success: boolean;
  steps: StepResult[];
  errors: string[];
  warnings: string[];
  environment: Record<string, string>;
  interpreterPath?: string;
}

export interface StepResult {
  name: string;
  success: boolean;
  output: string;
  error?: string;
  skipped?: boolean;
  duration: number;
}

export class ProjectSetupService {
  private configs: Record<string, ProjectConfig>;
  private logFile: string;

  constructor() {
    this.loadConfigs();
    this.logFile = path.join(__dirname, '../logs/deployment.log');
    this.ensureLogDirectory();
  }

  private loadConfigs(): void {
    try {
      const configPath = path.join(__dirname, '../config/project-configs.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const parsedConfig = JSON.parse(configData);
      this.configs = parsedConfig.projectTypes;
    } catch (error) {
      console.error('Failed to load project configurations:', error);
      this.configs = {};
    }
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    console.log(message);
    try {
      fs.appendFileSync(this.logFile, logMessage);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  public detectProjectType(projectPath: string): string | null {
    this.log(`Detecting project type for: ${projectPath}`);
    
    for (const [type, config] of Object.entries(this.configs)) {
      // Check for specific files
      for (const file of config.detection.files) {
        const filePath = path.join(projectPath, file);
        if (fs.existsSync(filePath)) {
          this.log(`Detected ${type} project based on file: ${file}`);
          return type;
        }
      }
      
      // Check for file patterns (e.g., *.csproj)
      if (config.detection.files.some(file => file.includes('*'))) {
        try {
          const files = fs.readdirSync(projectPath);
          for (const pattern of config.detection.files) {
            if (pattern.includes('*')) {
              const extension = pattern.replace('*', '');
              if (files.some(file => file.endsWith(extension))) {
                this.log(`Detected ${type} project based on pattern: ${pattern}`);
                return type;
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or can't be read
        }
      }
    }
    
    this.log('Could not detect project type');
    return null;
  }

  public async setupProject(projectPath: string, projectType: string): Promise<SetupResult> {
    this.log(`Starting setup for ${projectType} project at: ${projectPath}`);
    
    const config = this.configs[projectType];
    if (!config) {
      throw new Error(`Unknown project type: ${projectType}`);
    }

    const result: SetupResult = {
      success: true,
      steps: [],
      errors: [],
      warnings: [],
      environment: { ...config.setup.environment }
    };

    for (const step of config.setup.steps) {
      const stepStart = Date.now();
      
      try {
        // Check if step should be skipped
        if (this.shouldSkipStep(step, projectPath)) {
          result.steps.push({
            name: step.name,
            success: true,
            output: 'Skipped - condition not met',
            skipped: true,
            duration: 0
          });
          continue;
        }

        this.log(`Executing step: ${step.name}`);
        const stepResult = await this.executeStep(step, projectPath, result.environment);
        const duration = Date.now() - stepStart;
        
        result.steps.push({
          ...stepResult,
          duration
        });

        if (!stepResult.success && step.required) {
          result.success = false;
          result.errors.push(`Required step failed: ${step.name} - ${stepResult.error}`);
          break;
        } else if (!stepResult.success) {
          result.warnings.push(`Optional step failed: ${step.name} - ${stepResult.error}`);
        }

      } catch (error) {
        const duration = Date.now() - stepStart;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        result.steps.push({
          name: step.name,
          success: false,
          output: '',
          error: errorMessage,
          duration
        });

        if (step.required) {
          result.success = false;
          result.errors.push(`Required step failed: ${step.name} - ${errorMessage}`);
          break;
        } else {
          result.warnings.push(`Optional step failed: ${step.name} - ${errorMessage}`);
        }
      }
    }

    // Set interpreter path for Python projects
    if (projectType === 'python' && result.success) {
      const platform = os.platform();
      const venvPath = platform === 'win32' 
        ? path.join(projectPath, 'venv', 'Scripts', 'python.exe')
        : path.join(projectPath, 'venv', 'bin', 'python');
      
      if (fs.existsSync(venvPath)) {
        result.interpreterPath = venvPath;
        result.environment.PYTHON_INTERPRETER = venvPath;
      }
    }

    // Validate the setup
    const validationResult = await this.validateSetup(projectPath, config);
    if (!validationResult.success) {
      result.success = false;
      result.errors.push(...validationResult.errors);
    }

    this.log(`Setup completed. Success: ${result.success}`);
    return result;
  }

  private shouldSkipStep(step: SetupStep, projectPath: string): boolean {
    // Check platform
    if (step.platform) {
      const currentPlatform = os.platform() === 'win32' ? 'win32' : 'unix';
      if (step.platform !== currentPlatform) {
        return true;
      }
    }

    // Check conditional requirements
    if (step.conditional) {
      switch (step.conditional) {
        case 'build_script_exists':
          try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
              const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
              return !packageJson.scripts?.build;
            }
            return true;
          } catch {
            return true;
          }
        
        case 'test_script_exists':
          try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
              const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
              return !packageJson.scripts?.test;
            }
            return true;
          } catch {
            return true;
          }
        
        case 'requirements_exists':
          return !fs.existsSync(path.join(projectPath, 'requirements.txt'));
        
        case 'pyproject_exists':
          return !fs.existsSync(path.join(projectPath, 'pyproject.toml'));
        
        case 'test_project_exists':
          // Check for test projects in .NET solutions
          try {
            const files = fs.readdirSync(projectPath);
            return !files.some(file => file.toLowerCase().includes('test') && file.endsWith('.csproj'));
          } catch {
            return true;
          }
        
        default:
          return false;
      }
    }

    return false;
  }
  private async executeStep(step: SetupStep, projectPath: string, environment: Record<string, string>): Promise<Omit<StepResult, 'duration'>> {
    const workingDir = step.workingDirectory === 'project' ? projectPath : process.cwd();
    let command = step.command;
    
    // Handle virtual environment activation for Python
    if (step.useVenv && os.platform() === 'win32') {
      const venvActivate = path.join(projectPath, 'venv', 'Scripts', 'Activate.ps1');
      if (fs.existsSync(venvActivate)) {
        command = `& "${venvActivate}"; ${command}`;
      }
    }

    return new Promise((resolve) => {
      const timeout = step.timeout || 300000; // 5 minutes default
      
      // Use cmd for simpler commands, powershell for complex ones
      const isComplexCommand = command.includes('&') || command.includes(';') || step.useVenv;
      const shell = isComplexCommand ? 'powershell.exe' : 'cmd.exe';
      const shellArgs = isComplexCommand ? ['-ExecutionPolicy', 'Bypass', '-Command', command] : ['/c', command];
      
      const child = spawn(shell, shellArgs, {
        cwd: workingDir,
        env: { ...process.env, ...environment },
        stdio: 'pipe',
        timeout,
        shell: false
      });

      let output = '';
      let error = '';

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        // Log real-time output for debugging
        console.log(`[${step.name}] ${text.trim()}`);
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        error += text;
        console.error(`[${step.name}] ERROR: ${text.trim()}`);
      });

      child.on('close', (code) => {
        const success = code === 0;
        this.log(`Step "${step.name}" completed with exit code: ${code}`);
        resolve({
          name: step.name,
          success,
          output: output.trim(),
          error: error.trim() || undefined
        });
      });

      child.on('error', (err) => {
        this.log(`Step "${step.name}" failed with error: ${err.message}`);
        resolve({
          name: step.name,
          success: false,
          output: '',
          error: err.message
        });
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          name: step.name,
          success: false,
          output: output.trim(),
          error: `Command timed out after ${timeout}ms`
        });
      }, timeout);

      child.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  private async validateSetup(projectPath: string, config: ProjectConfig): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const check of config.validation.checks) {
      let checkPassed = false;

      if (check.file) {
        checkPassed = fs.existsSync(path.join(projectPath, check.file));
      } else if (check.directory) {
        checkPassed = fs.existsSync(path.join(projectPath, check.directory));
      } else if (check.pattern) {
        try {
          const files = fs.readdirSync(projectPath);
          const extension = check.pattern.replace('*', '');
          checkPassed = files.some(file => file.endsWith(extension));
        } catch {
          checkPassed = false;
        }
      }

      if (!checkPassed && !check.optional) {
        errors.push(`Validation failed: ${check.name}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  public getProjectConfig(projectType: string): ProjectConfig | null {
    return this.configs[projectType] || null;
  }

  public getSupportedProjectTypes(): string[] {
    return Object.keys(this.configs);
  }
}

export const projectSetupService = new ProjectSetupService();
