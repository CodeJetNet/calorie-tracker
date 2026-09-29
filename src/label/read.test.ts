jest.mock('../../modules/label-text', () => ({ recognize: jest.fn() }));
import { recognize } from '../../modules/label-text';
import { readLabel } from './read';
const line = (text: string, y: number) => ({ text, x: 0.1, y, w: 0.5, h: 0.03 });
const upright = [line('Calories 210', 0.1), line('Total Fat 13g', 0.2), line('Protein 15g', 0.3), line('Sodium 220mg', 0.4)];

test('an upright label reads on the first try', async () => {
  (recognize as jest.Mock).mockResolvedValueOnce(upright);
  expect((await readLabel('file:///x.jpg'))?.nutrients).toMatchObject({ '1008': 210, '1003': 15 });
  expect(recognize).toHaveBeenCalledTimes(1);
});
test('a sideways label is retried turned', async () => {
  (recognize as jest.Mock).mockReset().mockResolvedValueOnce([line('lelnoN', 0.1)]).mockResolvedValueOnce(upright);
  expect((await readLabel('file:///x.jpg'))?.nutrients['1004']).toBe(13);
  expect(recognize).toHaveBeenLastCalledWith('file:///x.jpg', 90);
});
test('no values in any orientation is null', async () => {
  (recognize as jest.Mock).mockReset().mockResolvedValue([line('a photo of a cat', 0.1)]);
  expect(await readLabel('file:///x.jpg')).toBeNull();
});
