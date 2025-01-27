import { AIService, GenerateTagsOptions, GenerateTitleOptions, GenerateFolderOptions } from '../ai_service';

describe('AIService', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService({
      modelName: 'gpt-3.5-turbo',
      apiKey: 'test-key',
      debug: true
    });
  });

  describe('generateTags', () => {
    it('should generate tags for given content', async () => {
      const options: GenerateTagsOptions = {
        content: 'This is a test document about AI and machine learning.',
        fileName: 'test.md',
        existingTags: ['#ai', '#tech'],
        count: 2
      };

      const tags = await aiService.generateTags(options);

      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeLessThanOrEqual(2);
      tags.forEach(tag => {
        expect(tag).toHaveProperty('score');
        expect(tag).toHaveProperty('isNew');
        expect(tag).toHaveProperty('tag');
        expect(tag).toHaveProperty('reason');
        expect(tag.score).toBeGreaterThanOrEqual(0);
        expect(tag.score).toBeLessThanOrEqual(100);
        expect(tag.tag.startsWith('#')).toBe(true);
      });
    });

    it('should handle errors gracefully', async () => {
      const options: GenerateTagsOptions = {
        content: '',
        fileName: '',
      };

      await expect(aiService.generateTags(options)).rejects.toThrow();
    });
  });

  describe('generateTitle', () => {
    it('should generate titles for given content', async () => {
      const options: GenerateTitleOptions = {
        content: 'This is a test document about AI and machine learning.',
        fileName: 'test.md',
        count: 2
      };

      const titles = await aiService.generateTitle(options);

      expect(Array.isArray(titles)).toBe(true);
      expect(titles.length).toBeLessThanOrEqual(2);
      titles.forEach(title => {
        expect(title).toHaveProperty('score');
        expect(title).toHaveProperty('title');
        expect(title).toHaveProperty('reason');
        expect(title.score).toBeGreaterThanOrEqual(0);
        expect(title.score).toBeLessThanOrEqual(100);
      });
    });

    it('should handle errors gracefully', async () => {
      const options: GenerateTitleOptions = {
        content: '',
        fileName: '',
      };

      await expect(aiService.generateTitle(options)).rejects.toThrow();
    });

    it('should keep original filename when no rename needed', async () => {
      const options: GenerateTitleOptions = {
        content: 'Simple content',
        fileName: 'perfect-name.md',
      };

      const titles = await aiService.generateTitle(options);
      expect(titles[0].title).toBe('perfect-name.md');
    });
  });

  describe('generateFolder', () => {
    it('should generate folder suggestions for given content', async () => {
      const options: GenerateFolderOptions = {
        content: 'This is a test document about AI and machine learning.',
        fileName: 'test.md',
        folders: ['AI', 'Tech', 'Documents'],
        count: 2
      };

      const folders = await aiService.generateFolder(options);

      expect(Array.isArray(folders)).toBe(true);
      expect(folders.length).toBeLessThanOrEqual(2);
      folders.forEach(folder => {
        expect(folder).toHaveProperty('score');
        expect(folder).toHaveProperty('isNewFolder');
        expect(folder).toHaveProperty('folder');
        expect(folder).toHaveProperty('reason');
        expect(folder.score).toBeGreaterThanOrEqual(0);
        expect(folder.score).toBeLessThanOrEqual(100);
      });
    });

    it('should handle errors gracefully', async () => {
      const options: GenerateFolderOptions = {
        content: '',
        fileName: '',
        folders: [],
      };

      await expect(aiService.generateFolder(options)).rejects.toThrow();
    });

    it('should suggest new folders when no existing folders match', async () => {
      const options: GenerateFolderOptions = {
        content: 'This is a unique document about quantum physics.',
        fileName: 'quantum.md',
        folders: ['AI', 'Tech'],
      };

      const folders = await aiService.generateFolder(options);
      expect(folders.some(f => f.isNewFolder)).toBe(true);
    });
  });
}); 