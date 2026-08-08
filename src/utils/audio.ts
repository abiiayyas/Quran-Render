export const getAudioDuration = (url: string): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      resolve(audio.duration * 1000); // return in ms
    };
    audio.onerror = () => {
      resolve(0);
    };
  });
};
