export class IndeedBrowserSource {
    name = "indeed";
    async discoverJobs(_request) {
        throw new Error("Indeed browser discovery is planned but not implemented yet.");
    }
}
