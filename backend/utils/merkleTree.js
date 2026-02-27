import crypto from 'crypto';

/**
 * MerkleTree - Utility for cryptographic audit trails (#475)
 */
class MerkleTree {
    constructor(leaves = []) {
        this.leaves = leaves.map(leaf => this.hash(leaf));
        this.tree = [this.leaves];
        this.buildTree();
    }

    hash(data) {
        let content = data;
        if (typeof data !== 'string') {
            content = JSON.stringify(data);
        }
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    combine(left, right) {
        return crypto.createHash('sha256').update(left + right).digest('hex');
    }

    buildTree() {
        let currentLayer = this.leaves;
        while (currentLayer.length > 1) {
            const nextLayer = [];
            for (let i = 0; i < currentLayer.length; i += 2) {
                const left = currentLayer[i];
                const right = currentLayer[i + 1] || left; // Duplicate last node if odd
                nextLayer.push(this.combine(left, right));
            }
            this.tree.push(nextLayer);
            currentLayer = nextLayer;
        }
    }

    getRoot() {
        return this.tree[this.tree.length - 1][0] || null;
    }

    getProof(index) {
        const proof = [];
        let currentIndex = index;

        for (let i = 0; i < this.tree.length - 1; i++) {
            const layer = this.tree[i];
            const isRightNode = currentIndex % 2 === 1;
            const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

            if (siblingIndex < layer.length) {
                proof.push({
                    position: isRightNode ? 'left' : 'right',
                    hash: layer[siblingIndex]
                });
            } else {
                // If it's the last node with no sibling, it was combined with itself
                proof.push({
                    position: 'right',
                    hash: layer[currentIndex]
                });
            }

            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    verifyProof(leaf, proof, root) {
        let currentHash = this.hash(leaf);

        for (const p of proof) {
            if (p.position === 'left') {
                currentHash = this.combine(p.hash, currentHash);
            } else {
                currentHash = this.combine(currentHash, p.hash);
            }
        }

        return currentHash === root;
    }
}

export { MerkleTree };
