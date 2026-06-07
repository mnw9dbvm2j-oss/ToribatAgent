// 모든 3D 생성 Provider가 구현해야 하는 인터페이스
export interface ModelProvider {
  readonly id: string;
  generate(image: File): Promise<GenerationResult>;
}

export interface GenerationResult {
  modelUrl: string;
  taskId: string;
}
