
export class UserService {
  private users: string[] = []

  getUser(id: string): string | undefined {
    return this.users.find(u => u === id)
  }

  addUser(name: string): void {
    this.users.push(name)
  }
}
