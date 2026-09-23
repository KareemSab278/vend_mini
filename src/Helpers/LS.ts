
export const LS = {
    get:    async (key: string, orElse?: any) => await Storage.getObjFromKey(key) ?? orElse,
    save:   async (key: string, value: any) => await Storage.saveObjToKey(key, value),
    remove: async (key: string) => await Storage.removeDataFromKey(key),
    clear:  async () => await Storage.clearAllData()
};

const Storage = {
    saveValToKey: async (key: string, value: string) => {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.error('Error storing value to key:', e);
        }
    },

    getDataFromKey: async (key: string) => {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.error('Error retrieving data from key:', e);
        }
    },

    saveObjToKey: async (key: string, value: any) => {
        try {
            const jsonValue = JSON.stringify(value);
            localStorage.setItem(key, jsonValue);
        } catch (e) {
            console.error('Error storing object to key:', e);
        }
    },

    getObjFromKey: async (key: string) => {
        try {
            const jsonValue = localStorage.getItem(key);
            return jsonValue !== null ? JSON.parse(jsonValue) : null;
        } catch (e) {
            console.error('Error retrieving object from key:', e);
        }
    },

    removeDataFromKey: async (key: string) => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('Error removing data from key:', e);
        }
    },

    clearAllData: async () => {
        try {
            localStorage.clear();
        } catch (e) {
            console.error('Error clearing all data:', e);
        }
    },
};