import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { useAppStore } from '../store';

export const saveProject = async () => {
  try {
    const store = useAppStore.getState();
    const projectData = {
      audioPath: store.audioPath,
      bgPath: store.bgPath,
      verses: store.verses,
      slides: store.slides,
      customization: store.customization,
      selectedTemplate: store.selectedTemplate
    };

    const filePath = await save({
      filters: [{ name: 'Quran Render Project', extensions: ['qproject'] }],
      defaultPath: 'my-project.qproject',
    });

    if (filePath) {
      await writeTextFile(filePath, JSON.stringify(projectData, null, 2));
      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to save project:", error);
    throw error;
  }
};

export const loadProject = async () => {
  try {
    const filePath = (await open({
      filters: [{ name: 'Quran Render Project', extensions: ['qproject'] }],
      multiple: false,
    })) as string | null;

    if (filePath) {
      const content = await readTextFile(filePath);
      const projectData = JSON.parse(content);
      
      const store = useAppStore.getState();
      store.setAudioPath(projectData.audioPath || null);
      store.setBgPath(projectData.bgPath || null);
      store.setVerses(projectData.verses || []);
      store.setSlides(projectData.slides || []);
      if (projectData.customization) {
        store.updateCustomization(projectData.customization);
      }
      if (projectData.selectedTemplate) {
        store.setSelectedTemplate(projectData.selectedTemplate);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error("Failed to load project:", error);
    throw error;
  }
};
