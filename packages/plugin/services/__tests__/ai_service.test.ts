import { AIService, GenerateTagsOptions } from '../ai_service';

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
}); 