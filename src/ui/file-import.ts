import { identifyExcelFiles } from '../export/excel-export';

export interface FileImportCallbacks {
  onFilesSelected: (mapFile: File, monsterFile: File) => void;
  onError: (message: string) => void;
}

export class FileImport {
  private fileInput: HTMLInputElement;
  private callbacks: FileImportCallbacks;

  constructor(fileInput: HTMLInputElement, callbacks: FileImportCallbacks) {
    this.fileInput = fileInput;
    this.callbacks = callbacks;
    this.setupListeners();
  }

  private setupListeners(): void {
    this.fileInput.addEventListener('change', () => {
      const files = Array.from(this.fileInput.files ?? []);
      this.processFiles(files);
      // 重置 input 以允许重复选择同一文件
      this.fileInput.value = '';
    });
  }

  private processFiles(files: File[]): void {
    if (files.length === 0) return;

    // 验证文件类型
    for (const file of files) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        this.callbacks.onError(`请上传 .xlsx 文件，当前文件: ${file.name}`);
        return;
      }
    }

    if (files.length === 1) {
      this.callbacks.onError('请同时选择 map.xlsx 和 monster.xlsx 两个文件');
      return;
    }

    const { mapFile, monsterFile } = identifyExcelFiles(files);

    if (!mapFile || !monsterFile) {
      this.callbacks.onError('无法识别文件类型，请确保文件名包含 "map" 和 "monster"');
      return;
    }

    this.callbacks.onFilesSelected(mapFile, monsterFile);
  }

  /** 触发文件选择对话框 */
  trigger(): void {
    this.fileInput.click();
  }
}
