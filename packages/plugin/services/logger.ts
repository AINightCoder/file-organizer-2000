class LoggerService {
  private isEnabled = true;

  configure(enabled: boolean) {
    this.isEnabled = enabled;
  }

  info(...messages: any[]) {
    if (!this.isEnabled) return;
    console.info(...messages);
  }

  error(...messages: any[]) {
    if (!this.isEnabled) return;
    console.info(...messages);
  }

  warn(...messages: any[]) {
    if (!this.isEnabled) return;
    console.info(...messages);
  }

  debug(...messages: any[]) {
    if (!this.isEnabled) return;
    console.info(...messages);
  }


}

export const logger = new LoggerService(); 